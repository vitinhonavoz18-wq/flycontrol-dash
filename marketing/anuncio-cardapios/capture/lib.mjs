import { chromium } from 'playwright-core';
export async function openStore(slug, { dpr = 3 } = {}) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  // Segurança: nenhum pedido real. Bloqueia qualquer escrita (POST/PATCH/DELETE) e chamadas de função/webhook.
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.method() !== 'OPTIONS') {
      console.log('BLOQUEADO', req.method(), url.slice(0, 120));
      return route.fulfill({ status: 403, body: '{}' });
    }
    // O Chromium de gravação não toca H.264: entrega o MESMO vídeo do hero convertido para WebM.
    if (url.includes('/menu-images/hero/') && url.includes('.mp4')) {
      return route.fulfill({ status: 200, contentType: 'video/webm', path: `capture/hero/${slug}.webm` });
    }
    return route.continue();
  });
  // Só no navegador da gravação: marca a loja como "aberta" para o banner de fechado não cobrir o cardápio.
  await ctx.addInitScript(() => {
    const of = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await of(input, init);
      const u = typeof input === 'string' ? input : input.url;
      if (u && u.includes('/rest/v1/pizzerias_public')) {
        const t = await res.clone().text();
        try { const j = JSON.parse(t); const fix = (o) => (o && typeof o === 'object' ? { ...o, is_open: true } : o);
          return new Response(JSON.stringify(Array.isArray(j) ? j.map(fix) : fix(j)), { status: res.status, headers: res.headers }); } catch { return res; }
      }
      return res;
    };
  });
  const p = await ctx.newPage();
  await p.goto(`https://conectfly.com.br/${slug}`, { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(2000);
  return { b, ctx, p };
}
export async function settle(p, ms = 600) {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
  await p.waitForTimeout(ms);
}

// Congela o vídeo do hero num instante exato (gravação quadro a quadro, sem depender do relógio).
// O vídeo é recarregado como "blob" para o navegador conseguir pular para qualquer instante.
export async function prepareHero(p) {
  await p.evaluate(async () => {
    const v = document.querySelector('video'); if (!v || v.dataset.blob) return;
    const bl = await (await fetch(v.currentSrc || v.src)).blob();
    v.removeAttribute('autoplay'); v.pause();
    await new Promise(r => { v.onloadeddata = r; v.src = URL.createObjectURL(bl); v.load(); setTimeout(r, 8000); });
    v.dataset.blob = '1'; v.pause();
  });
}
export async function heroAt(p, t) {
  await p.evaluate(async (t) => {
    const v = document.querySelector('video'); if (!v) return;
    v.pause(); const tt = Math.min(t, (v.duration || 99) - 0.05);
    if (Math.abs(v.currentTime - tt) < 0.001) return;
    await new Promise(r => {
      let done = false; const fin = () => { if (!done) { done = true; r(); } };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fin());
      v.onseeked = () => setTimeout(fin, 60);
      v.currentTime = tt; setTimeout(fin, 2000);
    });
  }, t);
}

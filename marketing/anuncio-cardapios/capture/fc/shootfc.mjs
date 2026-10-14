// Grava as telas ORIGINAIS do painel FlyControl (gestão de pedidos e Minha Loja) com dados de demonstração.
import { chromium } from 'playwright-core';
import fs from 'fs';
import { installMock } from './mock.mjs';
const OUT = '/home/user/flycontrol-ad/capture/fcstills/'; fs.mkdirSync(OUT, { recursive: true });
const DPR = +(process.env.DPR || 3);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(w, h, path, dpr = DPR) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'pt-BR', timezoneId: 'America/Bahia', isMobile: w < 600, hasTouch: w < 600 });
  await installMock(ctx, { log: (...a) => a[0].startsWith('WRITE') && console.log(...a) });
  await ctx.route('http://127.0.0.1:8080/_serverFn/**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/menu-images/hero/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', path: '/home/user/flycontrol-ad/capture/hero/acai-deus-provera.webm' }));
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8080' + path, { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(3500);
  // esconde só o botão flutuante "Precisa de ajuda?" para não cobrir os pedidos
  await p.addStyleTag({ content: '[aria-label*="ajuda" i], button:has(> svg + span:text("Precisa de ajuda?")) { }' });
  return p;
}
const box = async (l) => { const r = await l.boundingBox(); return r ? [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] : null; };
const shot = async (p, name) => { await p.waitForTimeout(900); await p.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 94 }); console.log('still', name); };
const taps = {};
{ // gestão de pedidos (celular)
  const p = await open(390, 844, '/dashboard');
  await shot(p, 'k0');
  taps.verDetalhes = await box(p.getByRole('button', { name: /Ver detalhes/ }).first());
  await p.getByRole('button', { name: /Ver detalhes/ }).first().click(); await shot(p, 'd1');
  taps.emPreparo = await box(p.getByRole('button', { name: /^Em preparo$/ }).last());
  await p.getByRole('button', { name: /^Em preparo$/ }).last().click(); await shot(p, 'd2');
}
{ // Minha Loja → Aparência (mudar o visual do cardápio)
  const p = await open(390, 844, '/my-store');
  const tab = p.getByRole('tab', { name: /Aparência/ });
  await tab.scrollIntoViewIfNeeded(); await tab.click(); await p.waitForTimeout(800);
  const white = p.getByText('White Clean', { exact: true });
  await white.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -260)); await p.waitForTimeout(500);
  await shot(p, 's1');
  taps.white = await box(white);
  await white.click(); await shot(p, 's2');
  const capa = p.getByRole('tab', { name: /Capa/ });
  await p.evaluate(() => window.scrollTo(0, 0)); await capa.scrollIntoViewIfNeeded(); taps.capa = await box(capa);
  await capa.click(); await p.waitForTimeout(1500);
  const y0 = await p.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /Capa do Cardápio \(Hero\)/.test(e.textContent)); return el ? el.getBoundingClientRect().top : 0; });
  await p.mouse.move(195, 400); await p.mouse.wheel(0, y0 - 90); await p.waitForTimeout(800); await p.waitForTimeout(2000);
  await p.evaluate(() => { const v = document.querySelector('video'); if (v) { v.pause(); v.currentTime = 3; } });
  await p.waitForTimeout(1200);
  await p.getByText('Capa do Cardápio (Hero)').first().evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 80));
  console.log('scrollY', await p.evaluate(() => window.scrollY));
  await shot(p, 'h1');
}
{ // painel no computador (fundo da cena)
  const p = await open(1440, 900, '/dashboard', 2);
  await shot(p, 'desk');
}
fs.writeFileSync(OUT + 'taps.json', JSON.stringify(taps));
console.log(JSON.stringify(taps));
await b.close();

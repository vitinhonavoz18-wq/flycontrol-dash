// Abre as páginas oficiais (navegador real, via proxy), salva texto, HTML e captura de tela com data/hora.
import { chromium } from 'playwright-core';
import fs from 'fs';
const OUT = new URL('./fontes/', import.meta.url).pathname;
const pages = [
  ['ifood-planos', 'https://parceiros.ifood.com.br/restaurante/planos-ifood'],
  ['99food-store', 'https://merchant.99app.com/pt-BR/store'],
  ['99food-guia-cobrancas', 'https://99app.com/99food/restaurantes/guias/entendendo-as-cobrancas-da-99food/'],
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
for (const [name, url] of pages) {
  const p = await ctx.newPage();
  try {
    const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(3000);
    // abre acordeões/abas de FAQ para o texto aparecer
    for (const el of await p.$$('button[aria-expanded="false"], summary')) { try { await el.click({ timeout: 500 }); } catch {} }
    await p.waitForTimeout(1000);
    const text = await p.evaluate(() => document.body.innerText);
    fs.writeFileSync(OUT + name + '.txt', `URL: ${url}\nHTTP: ${r && r.status()}\nConsultado em: ${new Date().toISOString()}\n\n` + text);
    fs.writeFileSync(OUT + name + '.html', await p.content());
    await p.screenshot({ path: OUT + name + '.png', fullPage: true });
    console.log(name, r && r.status(), text.length);
  } catch (e) { console.log(name, 'ERRO', e.message.slice(0, 120)); }
  await p.close();
}
await b.close();

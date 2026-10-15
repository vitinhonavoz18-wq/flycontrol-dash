import { chromium } from 'playwright-core';
import fs from 'fs';
const OUT = new URL('./fontes/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
const p = await ctx.newPage();
for (let tent = 1; tent <= 3; tent++) {
  const r = await p.goto('https://99app.com/99food/restaurantes/guias/entendendo-as-cobrancas-da-99food/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => null);
  await p.waitForTimeout(5000);
  const text = await p.evaluate(() => document.body.innerText).catch(() => '');
  console.log('tentativa', tent, r && r.status(), text.length);
  if (r && r.status() === 200 && text.length > 1000) {
    fs.writeFileSync(OUT + '99food-guia-cobrancas.txt', `URL: ${p.url()}\nConsultado em: ${new Date().toISOString()}\n\n` + text);
    await p.screenshot({ path: OUT + '99food-guia-cobrancas.png', fullPage: true });
    break;
  }
  await p.waitForTimeout(15000 * tent);
}
await b.close();

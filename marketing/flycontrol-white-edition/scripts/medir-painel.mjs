// Mede (em pixels lógicos 1180x820) as colunas do quadro e o card #1041 no painel em Modo Claro.
import { chromium } from 'playwright-core';
import fs from 'fs';
import { installMock } from './mock-painel.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Bahia' });
await installMock(ctx);
await ctx.route('http://127.0.0.1:8080/_serverFn/**', (r) => r.fulfill({ status: 500, body: '{}' }));
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8080/dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
await p.locator('#theme-toggle').click(); await p.waitForTimeout(800);
await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(1200);
const measure = () => p.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const out = {};
  for (const name of ['Novo pedido', 'Em preparo', 'Saiu para entrega']) {
    const h = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === name);
    let c = h; for (let i = 0; i < 8 && c && c.getBoundingClientRect().height < 300; i++) c = c.parentElement;
    out[name] = { header: r(h.parentElement.parentElement), column: c ? r(c) : null };
  }
  const card = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === '#1041');
  let k = card; for (let i = 0; i < 6 && k && k.getBoundingClientRect().height < 150; i++) k = k.parentElement;
  out.card1041 = r(k);
  return out;
});
const before = await measure();
await p.getByRole('button', { name: /Ver detalhes/ }).first().click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: /^Em preparo$/ }).last().click(); await p.waitForTimeout(800);
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
const after = await measure();
fs.writeFileSync(new URL('../componentes-3d/medidas-painel.json', import.meta.url).pathname, JSON.stringify({ before, after }, null, 1));
console.log(JSON.stringify({ before, after }));
await b.close();

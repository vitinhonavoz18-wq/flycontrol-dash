// Captura o painel ORIGINAL do FlyControl em Modo Claro (White), ativado pelo interruptor real da interface.
// Painel rodando local (flycontrol-dash, `vite dev`), dados de DEMONSTRAÇÃO (scripts/mock-painel.mjs):
// nenhum pedido real, nenhuma escrita no banco real, nenhuma preferência de outros usuários alterada.
import { chromium } from 'playwright-core';
import fs from 'fs';
import { installMock } from './mock-painel.mjs';
const OUT = new URL('../capturas-reais/painel-white/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const note = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function ctxWithMock(opts) {
  const ctx = await b.newContext({ locale: 'pt-BR', timezoneId: 'America/Bahia', ...opts });
  await installMock(ctx, { log: (...a) => a[0].startsWith('WRITE') && note('escrita simulada (só nesta gravação):', ...a.slice(1)) });
  await ctx.route('http://127.0.0.1:8080/_serverFn/**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/menu-images/hero/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', path: '/home/user/flycontrol-ad/capture/hero/acai-deus-provera.webm' }));
  return ctx;
}
const theme = (p) => p.evaluate(() => ({ cls: document.documentElement.className, saved: localStorage.getItem('flycontrol-theme'), bg: getComputedStyle(document.body).backgroundColor }));
const shot = async (p, name) => { await p.waitForTimeout(1000); await p.screenshot({ path: OUT + name + '.png' }); note('captura:', name); };
const box = async (l) => { const r = await l.boundingBox(); return r && [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };

// 1) TABLET (iPad na horizontal, 1180x820, alta definição). Abre no computador para achar o interruptor.
{
  const ctx = await ctxWithMock({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8080/dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  note('tema ao abrir:', JSON.stringify(await theme(p)));
  await shot(p, '00-antes-modo-escuro');
  const sw = p.locator('#theme-toggle');
  note('interruptor encontrado:', await sw.count(), '| rótulo:', await p.locator('label[for=theme-toggle]').innerText());
  await sw.click(); await p.waitForTimeout(1200);
  const th = await theme(p);
  note('tema depois do clique:', JSON.stringify(th), '| rótulo agora:', await p.locator('label[for=theme-toggle]').innerText());
  if (!th.cls.includes('light')) throw new Error('Modo claro NÃO ativou — captura interrompida');
  await shot(p, '01-depois-modo-claro-computador');
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(1500);
  await shot(p, '02-tablet-quadro-de-pedidos');
  const taps = {};
  const ver = p.getByRole('button', { name: /Ver detalhes/ }).first();
  taps.verDetalhes = await box(ver);
  await ver.click(); await shot(p, '03-tablet-detalhes-do-pedido');
  const prep = p.getByRole('button', { name: /^Em preparo$/ }).last();
  taps.emPreparo = await box(prep);
  await prep.click(); await shot(p, '04-tablet-flystatus-em-preparo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500); await p.keyboard.press('Escape');
  await shot(p, '05-tablet-quadro-atualizado');
  fs.writeFileSync(OUT + 'toques-tablet.json', JSON.stringify(taps));
  note('tema no fim:', JSON.stringify(await theme(p)));
  await ctx.close();
}
fs.writeFileSync(OUT + 'registro-da-captura.txt', log.join('\n') + '\n');
await b.close();

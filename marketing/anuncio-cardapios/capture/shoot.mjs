// Grava quadro a quadro (30 fps) as telas REAIS dos cardápios em conectfly.com.br.
// Nada é enviado: toda escrita (POST/PATCH/DELETE) é bloqueada em lib.mjs.
import { openStore, settle, heroAt, prepareHero } from './lib.mjs';
import fs from 'fs';
const FPS = 30;
const PREVIEW = !!process.env.PREVIEW;
const DPR = PREVIEW ? 1 : 3;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

async function yOf(p, re, offset = 0) {
  return p.evaluate(([src, flags, offset]) => {
    const re = new RegExp(src, flags);
    const el = [...document.querySelectorAll('h1,h2,h3,h4,p,span,div,button')].find(e => e.childElementCount <= 1 && re.test((e.innerText || '').trim()));
    if (!el) return null;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset);
  }, [re.source, re.flags, offset]);
}

// keys: [{t, y}] posição da rolagem ao longo do tempo (s). heroStart: em que segundo do vídeo do hero começar.
async function recordPath(p, name, dur, keys, { heroStart = 0, heroDur = 8 } = {}) {
  const dir = `capture/frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const N = Math.round(dur * FPS);
  const ys = keys.map(k => k.y);
  for (let y = Math.min(...ys); y <= Math.max(...ys) + 900; y += 400) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(250); }
  await p.evaluate((y) => window.scrollTo(0, y), keys[0].y); await settle(p, 800);
  for (let i = 0; i < N; i += PREVIEW ? 10 : 1) {
    const t = i / FPS;
    let y = keys[0].y;
    for (let k = 0; k < keys.length - 1; k++) {
      const a = keys[k], b = keys[k + 1];
      if (t >= a.t && t <= b.t) { y = a.y + (b.y - a.y) * ease((t - a.t) / (b.t - a.t)); break; }
      if (t > b.t) y = b.y;
    }
    await p.evaluate((y) => window.scrollTo(0, y), Math.round(y));
    await heroAt(p, (heroStart + t) % heroDur);
    await p.waitForTimeout(16);
    await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log('ok', name, N);
}

async function still(p, name) {
  fs.mkdirSync('capture/stills', { recursive: true });
  await settle(p, 900);
  await p.screenshot({ path: `capture/stills/${name}.jpg`, type: 'jpeg', quality: 94 });
  console.log('still', name);
}

const jobs = {
  async 'teste-001-5srj'() {
    const { b, p } = await openStore('teste-001-5srj', { dpr: DPR }); await settle(p, 1500); await prepareHero(p);
    await recordPath(p, 'hero-al', 5, [{ t: 0, y: 0 }], { heroDur: 6 });
    const yGrid = await yOf(p, /^NOSSO\s*CARDÁPIO/i, -60);
    await recordPath(p, 'al', 7.9, [{ t: 0, y: 0 }, { t: 5.9, y: 0 }, { t: 7.6, y: yGrid }], { heroDur: 6 });
    await b.close();
  },
  async 'brasa-do-joao'() {
    const { b, p } = await openStore('brasa-do-joao', { dpr: DPR }); await settle(p, 1500); await prepareHero(p);
    await recordPath(p, 'hero-bj', 5, [{ t: 0, y: 0 }]);
    const yE = await yOf(p, /^NOSSA\s*COZINHA/i, -40);
    await recordPath(p, 'bj', 2.6, [{ t: 0, y: 0 }, { t: 1.0, y: 0 }, { t: 2.4, y: yE }], { heroStart: 1 });
    await b.close();
  },
  async 'acai-deus-provera'() {
    const { b, p } = await openStore('acai-deus-provera', { dpr: DPR }); await settle(p, 1500); await prepareHero(p);
    await recordPath(p, 'hero-dp', 5, [{ t: 0, y: 0 }]);
    const yM = await yOf(p, /^MONTE SEU/i, -40);
    await recordPath(p, 'dp', 2.2, [{ t: 0, y: 0 }, { t: 0.8, y: 0 }, { t: 2.1, y: yM }], { heroStart: 2 });
    const yA = await yOf(p, /^AÇAÍ NA TIGELA 300ML/i, -330);
    await recordPath(p, 'dp-acai', 1.3, [{ t: 0, y: yA }, { t: 1.3, y: yA + 140 }]);
    const yH = await yOf(p, /^HAMBÚRGUER DE CARNE COM SALADA/i, -380);
    await recordPath(p, 'dp-burger', 1.7, [{ t: 0, y: yH }, { t: 1.7, y: yH + 120 }]);
    // Fluxo real: escolher, adicionais, adicionar ao carrinho, conferir o carrinho.
    await p.evaluate(() => {
      const t = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /AÇAÍ NA TIGELA 500ML/i.test(e.textContent));
      let c = t; while (c && ![...c.querySelectorAll('button')].some(b => /adicionar$/i.test(b.innerText.trim()))) c = c.parentElement;
      c.setAttribute('data-cap', 'card');
    });
    const card = p.locator('[data-cap=card]');
    const y5 = await yOf(p, /^AÇAÍ NA TIGELA 500ML/i, -330);
    await p.evaluate((y) => window.scrollTo(0, y), y5);
    await still(p, 'f1-card');
    await card.getByRole('button', { name: /ADICIONAIS/i }).click(); await still(p, 'f2-extras');
    await card.getByRole('button', { name: /^Nutella/ }).click(); await still(p, 'f3-x1');
    await card.getByRole('button', { name: /^Calda de Morango/ }).click(); await still(p, 'f4-x2');
    await card.getByRole('button', { name: /^Paçoca/ }).click(); await still(p, 'f5-x3');
    await card.getByRole('button', { name: /^\+?\s*ADICIONAR$/i }).click(); await still(p, 'f6-added');
    await p.getByRole('button', { name: /1\s*ITEM/i }).click(); await still(p, 'f7-cart');
    // rolagem dentro do carrinho para mostrar o resumo inteiro
    await p.evaluate(() => { const s = [...document.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20; }).pop(); if (s) s.scrollTo(0, s.scrollHeight); });
    await still(p, 'f8-cart-bottom');
    await b.close();
  },
  async 'd-lua-doces'() {
    const { b, p } = await openStore('d-lua-doces', { dpr: DPR }); await settle(p, 1500); await prepareHero(p);
    await recordPath(p, 'hero-dl', 5, [{ t: 0, y: 0 }]);
    const yB = await yOf(p, /^LUA BUENO/i, -330);
    await recordPath(p, 'dl-bueno', 1.0, [{ t: 0, y: yB }, { t: 1.0, y: yB + 60 }]);
    await b.close();
  },
  async 'alpha-pastelaria'() {
    const { b, p } = await openStore('alpha-pastelaria', { dpr: DPR }); await settle(p, 1500); await prepareHero(p);
    await recordPath(p, 'hero-ap', 5, [{ t: 0, y: 0 }]);
    await p.locator('button', { hasText: /past[eé]is/i }).filter({ hasText: /30 produtos/i }).first().click({ timeout: 15000 }); await settle(p, 1500); await prepareHero(p);
    await still(p, 'ap-cat');
    const y0 = await p.evaluate(() => window.scrollY);
    await recordPath(p, 'ap-pasteis', 1.4, [{ t: 0, y: y0 + 150 }, { t: 1.4, y: y0 + 330 }]);
    await b.close();
  },
};
const only = process.argv.slice(2);
await Promise.all(Object.entries(jobs).filter(([k]) => !only.length || only.includes(k)).map(([k, f]) => f().catch(e => console.error('ERRO', k, e.message))));

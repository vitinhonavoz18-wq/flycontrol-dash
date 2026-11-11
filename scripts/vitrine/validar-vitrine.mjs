/**
 * Confere a Vitrine de Cardápios no navegador (iPhone, Android, tablet e
 * computador emulados): cards, um vídeo por vez, pausa fora da tela, filtro,
 * janela ampliada, "reduzir movimento", links dos cardápios e erros no console.
 *
 * Uso: node scripts/vitrine/validar-vitrine.mjs [http://127.0.0.1:5173]
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require("/opt/node22/lib/node_modules/playwright");
}
const { chromium, devices } = pw;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const SHOTS = join(ROOT, "docs/vitrine/capturas");
const resultados = { aparelhos: [], links: [], extras: {} };

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const amostra = (p) =>
  p.evaluate(() => {
    const vids = [...document.querySelectorAll("article video")];
    return {
      cards: document.querySelectorAll("article").length,
      tocando: vids.filter((v) => !v.paused && v.readyState > 2).length,
      comEndereco: vids.filter((v) => v.getAttribute("src")).length,
      postersOk: [...document.querySelectorAll("article img")]
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0;
        })
        .every((i) => i.complete && i.naturalWidth > 0),
      rolagemLateral: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });

for (const [nome, d] of [
  ["iphone", devices["iPhone 13"]],
  ["android", devices["Pixel 7"]],
  ["tablet", devices["iPad Mini"]],
  ["computador", { viewport: { width: 1440, height: 900 } }],
]) {
  const ctx = await browser.newContext(d);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text().slice(0, 200)));
  let videoBytes = 0;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const tipo = new Map();
  cdp.on("Network.responseReceived", (e) => tipo.set(e.requestId, e.type));
  cdp.on("Network.dataReceived", (e) => {
    if (tipo.get(e.requestId) === "Media") videoBytes += e.encodedDataLength;
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/vitrine`, { waitUntil: "domcontentloaded" });
  await page.locator("article").first().waitFor();
  let primeiroPlay = null;
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("article video")].some((v) => !v.paused && v.readyState > 2),
      null,
      { timeout: 15000 },
    );
    primeiroPlay = Date.now() - t0;
  } catch {}
  await page.waitForTimeout(2500);
  const lcp = await page.evaluate(
    () =>
      new Promise((ok) => {
        let v = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (v = e.startTime))).observe({
          type: "largest-contentful-paint",
          buffered: true,
        });
        setTimeout(() => ok(Math.round(v)), 200);
      }),
  );
  const cls = await page.evaluate(
    () =>
      new Promise((ok) => {
        let v = 0;
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            if (!e.hadRecentInput) v += e.value;
          }),
        ).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => ok(Math.round(v * 1000) / 1000), 200);
      }),
  );
  const topo = await amostra(page);
  await page.screenshot({ path: join(SHOTS, `vitrine-${nome}.png`) });
  const primeiroTocando = await page.evaluate(() =>
    [...document.querySelectorAll("article video")].findIndex((v) => !v.paused),
  );
  // percorre a página em 6 paradas: em cada uma, no máximo 1 vídeo tocando
  const paradas = [];
  for (const k of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    await page.evaluate(
      (k) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * k),
      k,
    );
    await page.waitForTimeout(1800);
    paradas.push((await amostra(page)).tocando);
  }
  const meio = { ...(await amostra(page)), tocandoPorParada: paradas };
  const depoisTocando = await page.evaluate(() =>
    [...document.querySelectorAll("article video")].findIndex((v) => !v.paused),
  );
  await page.screenshot({ path: join(SHOTS, `vitrine-${nome}-meio.png`) });
  resultados.aparelhos.push({
    nome,
    primeiroPlayMs: primeiroPlay,
    lcpMs: lcp,
    cls,
    topo,
    meio,
    trocouAoRolar: primeiroTocando !== depoisTocando,
    mbDeVideoBaixados: Math.round(videoBytes / 10485.76) / 100,
    erros: [...new Set(erros)].slice(0, 5),
  });
  console.log(nome, JSON.stringify(resultados.aparelhos.at(-1)));
  await ctx.close();
}

// filtro, janela ampliada e chamada final (computador)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/vitrine`, { waitUntil: "networkidle" });
  const filtros = page.getByRole("group", { name: /filtrar/i }).getByRole("button");
  const nFiltros = await filtros.count();
  let filtrado = null;
  if (nFiltros > 1) {
    await filtros.nth(1).click();
    await page.waitForTimeout(800);
    filtrado = {
      botao: (await filtros.nth(1).innerText()).replace(/\s+/g, " "),
      cards: await page.locator("article").count(),
    };
    await filtros.first().click();
    await page.waitForTimeout(600);
  }
  await page
    .getByRole("button", { name: /ampliar a demonstração/i })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const ampliada = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"] video');
    return {
      abriu: !!dlg,
      tocandoNaJanela: !!dlg && !dlg.paused,
      cardsTocando: [...document.querySelectorAll("article video")].filter((v) => !v.paused).length,
    };
  });
  await page.screenshot({ path: join(SHOTS, "vitrine-ampliada.png") });
  await page.keyboard.press("Escape");
  const cta = await page
    .getByRole("link", { name: "Quero meu cardápio digital" })
    .getAttribute("href");
  const navLink = await page
    .getByRole("navigation")
    .first()
    .getByRole("link", { name: /vitrine/i })
    .getAttribute("href");
  resultados.extras = {
    filtros: nFiltros,
    filtrado,
    ampliada,
    ctaFinal: cta,
    linkNoCabecalho: navLink,
  };
  console.log("extras", JSON.stringify(resultados.extras));
  await ctx.close();
}

// "reduzir movimento": nada toca sozinho
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/vitrine`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  resultados.extras.reduzirMovimento = await amostra(page);
  console.log("reduzir movimento", JSON.stringify(resultados.extras.reduzirMovimento));
  await ctx.close();
}

// links dos cardápios
const dados = JSON.parse(
  (await import("node:fs")).readFileSync(join(ROOT, "src/lib/vitrine/demonstracoes.json"), "utf8"),
);
for (const d of dados.filter((x) => x.publicar)) {
  const r = await fetch(d.url, { method: "GET", redirect: "follow" }).catch((e) => ({
    status: String(e),
  }));
  resultados.links.push({ loja: d.nome, url: d.url, status: r.status });
}
console.log("links", resultados.links.map((l) => `${l.status}`).join(" "));
await browser.close();
writeFileSync(
  join(ROOT, "docs/vitrine/validacao.json"),
  `${JSON.stringify(resultados, null, 2)}\n`,
);

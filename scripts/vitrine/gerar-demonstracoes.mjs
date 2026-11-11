/**
 * Gera as demonstrações em vídeo da Vitrine de Cardápios (/vitrine).
 *
 * Para cada cardápio listado em src/lib/vitrine/demonstracoes.json:
 *   1. confere se o site público responde e sai do "Carregando...";
 *   2. pula se já existe gravação válida (mesma versão do roteiro, com menos
 *      de 30 dias) — use --forcar para regravar;
 *   3. abre o cardápio num navegador automatizado, em formato de celular, e
 *      grava o roteiro:
 *        0–3 s   capa (hero) parada, com a animação/vídeo real tocando
 *        3–7 s   rolagem suave até o cardápio
 *        7–12 s  produto: toca em "Adicionar" num item com foto (e escolhe a
 *                opção obrigatória, se o site pedir)
 *        12–18 s carrinho: abre o resumo do pedido e mostra as opções
 *      Se algum passo não existir naquele cardápio (loja fechada, por
 *      exemplo), o vídeo termina mostrando o cardápio — nada é simulado;
 *   4. monta o vídeo com o horário real de cada quadro (sem "engasgo"),
 *      gera MP4 (H.264, sem áudio, faststart), WebM (VP9, só se ficar menor)
 *      e a foto de capa (poster);
 *   5. grava as informações no JSON, que a página /vitrine lê.
 *
 * SEGURANÇA: tudo que não for leitura (GET) é bloqueado na rede. O botão
 * "FINALIZAR PEDIDO" nunca é tocado. Nenhum pedido, mensagem de WhatsApp ou
 * dado sai do navegador da gravação.
 *
 * NOVOS CARDÁPIOS entram com `publicar: false` — só aparecem na vitrine
 * depois que alguém muda para `true` no JSON (autorização do cliente).
 *
 * Uso:
 *   node scripts/vitrine/gerar-demonstracoes.mjs                 (todos)
 *   node scripts/vitrine/gerar-demonstracoes.mjs --so jc-burguer  (alguns)
 *   node scripts/vitrine/gerar-demonstracoes.mjs --forcar         (regrava)
 *   node scripts/vitrine/gerar-demonstracoes.mjs --novo meu-slug --nome "Minha Loja" --categoria Pizzaria
 *
 * Precisa: Node 22, FFmpeg e Playwright com Chromium.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require("/opt/node22/lib/node_modules/playwright");
}
const { chromium } = playwright;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG = join(ROOT, "src/lib/vitrine/demonstracoes.json");
const PUBLIC = join(ROOT, "public/vitrine");
const WORK = join(ROOT, ".vitrine-trabalho");

/** Mude este número quando o roteiro mudar: todas as gravações antigas viram "desatualizadas". */
const VERSAO_ROTEIRO = 3;
const VALIDADE_DIAS = 30;
const VIEW = { width: 360, height: 640 }; // 9:16
const DPR = 3; // captura em 1080×1920 (Full HD vertical)
const SAIDA = { w: 720, h: 1280 }; // publicado em 720p: nítido no card e leve na rede
const FPS = 30;

// ----------------------------------------------------------------- argumentos
const argv = process.argv.slice(2);
const arg = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};
const forcar = argv.includes("--forcar");
const so = arg("--so")?.split(",");

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const novo = arg("--novo");
if (novo && !config.some((c) => c.slug === novo)) {
  config.push({
    slug: novo,
    nome: arg("--nome") ?? novo,
    categoria: arg("--categoria") ?? "Delivery",
    cidade: arg("--cidade") ?? null,
    url: arg("--url") ?? `https://conectfly.com.br/${novo}`,
    cor: arg("--cor") ?? "#FF6B35",
    logo: null,
    publicar: false, // nunca publica sozinho: precisa de autorização
    observacao: "Novo: confira o vídeo e mude publicar para true quando o cliente autorizar.",
    video: null,
  });
}

const alvo = config.filter((c) => !so || so.includes(c.slug));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function gravacaoValida(c) {
  const v = c.video;
  if (!v || v.versaoRoteiro !== VERSAO_ROTEIRO) return false;
  if (!existsSync(join(ROOT, "public", v.mp4)) || !existsSync(join(ROOT, "public", v.poster)))
    return false;
  const idade = (Date.now() - Date.parse(v.gravadoEm)) / 86400000;
  return idade < VALIDADE_DIAS;
}

// ------------------------------------------------------------------ execução
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
});
const resumo = [];
for (const c of alvo) {
  if (!forcar && gravacaoValida(c)) {
    log(`${c.slug}: gravação válida (${c.video.gravadoEm.slice(0, 10)}) — mantida`);
    resumo.push({ slug: c.slug, acao: "mantida" });
    continue;
  }
  try {
    const r = await gravar(c);
    resumo.push({ slug: c.slug, acao: "gravada", ...r });
  } catch (e) {
    log(`${c.slug}: FALHOU — ${String(e.message ?? e).slice(0, 200)}`);
    resumo.push({ slug: c.slug, acao: "falhou", erro: String(e.message ?? e).slice(0, 300) });
  }
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`); // salva a cada loja
}
await browser.close();
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.table(
  resumo.map((r) => ({
    loja: r.slug,
    acao: r.acao,
    etapas: r.etapas?.join(" → ") ?? r.erro ?? "",
    mb: r.mb ?? "",
  })),
);

// ------------------------------------------------------------------- gravação
async function gravar(c) {
  log(`${c.slug}: abrindo ${c.url}`);
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });
  let bloqueadas = 0;
  await ctx.route("**/*", (r) => {
    if (["GET", "HEAD", "OPTIONS"].includes(r.request().method())) return r.continue();
    bloqueadas++;
    return r.abort();
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!resp || resp.status() >= 400) throw new Error(`site respondeu ${resp?.status()}`);
    await page.waitForFunction(
      () =>
        !/^\s*Carregando/i.test(document.body.innerText) && document.body.innerText.length > 200,
      null,
      { timeout: 60000 },
    );
    // capa pronta: vídeo tocando (se houver), fontes e imagens visíveis carregadas
    await page
      .waitForFunction(
        () => {
          const v = document.querySelector("video");
          return !v || (v.currentTime > 0.4 && !v.paused);
        },
        null,
        { timeout: 30000 },
      )
      .catch(() => {});
    await page.evaluate(() => document.fonts?.ready);
    await page
      .waitForFunction(
        () =>
          [...document.images]
            .filter((i) => {
              const r = i.getBoundingClientRect();
              return r.top < innerHeight && r.bottom > 0 && r.width > 0;
            })
            .every((i) => i.complete),
        null,
        { timeout: 20000 },
      )
      .catch(() => {});
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v) v.currentTime = 0;
    });
    await page.waitForTimeout(150);
    const fechada = await page.evaluate(() =>
      /estamos fechados|fechado no momento/i.test(document.body.innerText.slice(0, 600)),
    );

    const dir = join(WORK, c.slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const cap = await iniciarCaptura(page, dir);
    const etapas = ["capa"];

    // 0–3 s: capa
    await page.waitForTimeout(3100);

    // 3–7 s: rolagem cinematográfica até o cardápio
    const alvoY = await page.evaluate(() => {
      const t = [...document.querySelectorAll("h2,h3")].find((h) =>
        /card[aá]pio|cozinha|monte seu|feito para|burgers?|past[eé]is|a[çc]a[ií]/i.test(
          h.innerText,
        ),
      );
      const y = t ? t.getBoundingClientRect().top + scrollY - 70 : innerHeight * 1.05;
      return Math.min(y, document.documentElement.scrollHeight - innerHeight);
    });
    await rolar(page, alvoY, 2000);
    await page.waitForTimeout(500);
    await rolar(page, alvoY + 300, 1300);
    etapas.push("cardápio");

    // 7–12 s: produto
    let adicionou = false;
    if (!fechada) {
      // modelo "por categoria": os produtos só aparecem depois de escolher uma
      // categoria — toca na que tem mais produtos, como faria o cliente
      if ((await page.getByRole("button", { name: /^\s*\+?\s*adicionar\s*$/i }).count()) === 0) {
        const categoria = await maiorCategoria(page);
        if (categoria) {
          await tocar(page, categoria);
          await page.waitForTimeout(1400);
          etapas.push("categoria");
        }
      }
      const botao = await escolherProduto(page);
      if (botao) {
        const box = await botao.boundingBox();
        if (box)
          await rolar(page, (await page.evaluate(() => scrollY)) + box.y - VIEW.height * 0.45, 900);
        await page.waitForTimeout(500);
        await tocar(page, botao);
        await page.waitForTimeout(1100);
        // produto com opção obrigatória: o site abre uma janela; escolhe a 1ª opção e confirma
        const janela = page.locator('[role="dialog"]:visible').last();
        if (await janela.count()) {
          const txt = (await janela.innerText().catch(() => "")).slice(0, 400);
          if (!/seu pedido/i.test(txt)) {
            const opcao = janela
              .locator('[role="radio"], input[type="radio"], [role="checkbox"]')
              .first();
            if (await opcao.count()) {
              await tocar(page, opcao).catch(() => {});
              await page.waitForTimeout(600);
            }
            const confirmar = janela
              .getByRole("button", { name: /adicionar|confirmar|incluir|colocar/i })
              .last();
            if (await confirmar.count()) {
              await tocar(page, confirmar).catch(() => {});
              await page.waitForTimeout(900);
            }
          }
        }
        adicionou = await page
          .getByRole("button", { name: /\d+\s*ite(m|ns)/i })
          .first()
          .isVisible()
          .catch(() => false);
        if (adicionou) etapas.push("produto adicionado");
      }
      await page.waitForTimeout(800);
    }

    // 12–18 s: resumo do pedido (sem finalizar)
    if (adicionou) {
      await tocar(page, page.getByRole("button", { name: /\d+\s*ite(m|ns)/i }).first());
      await page.waitForTimeout(1600);
      const CARRINHO = /seu pedido|minha sele[çc][ãa]o|revise seus itens|meu carrinho|sacola/i;
      const resumoAberto = await page
        .getByText(CARRINHO)
        .first()
        .isVisible()
        .catch(() => false);
      if (resumoAberto) {
        etapas.push("resumo do pedido");
        // carrinho em duas telas: "Próximo passo" só troca para a tela de
        // entrega e pagamento (conferido no código do site: não envia nada)
        const proximo = page.getByRole("button", { name: /^\s*pr[óo]ximo passo/i }).first();
        if (await proximo.isVisible().catch(() => false)) {
          await page.waitForTimeout(700);
          await tocar(page, proximo);
          await page.waitForTimeout(1300);
          etapas.push("entrega e pagamento");
        }
        const retirada = page.getByRole("button", { name: /retirada/i }).first();
        if (await retirada.isVisible().catch(() => false)) {
          await tocar(page, retirada).catch(() => {});
          await page.waitForTimeout(900);
        }
        // rola o painel do carrinho devagar (o botão de finalizar NUNCA é tocado)
        await page.evaluate(async () => {
          const s = [...document.querySelectorAll("*")]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                e.scrollHeight > e.clientHeight + 40 &&
                /auto|scroll/.test(getComputedStyle(e).overflowY) &&
                r.height > 200 &&
                r.width > 200
              );
            })
            .sort(
              (a, b) =>
                Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0),
            )[0];
          if (!s) return;
          const de = s.scrollTop,
            ate = Math.min(s.scrollHeight - s.clientHeight, de + 420),
            t0 = performance.now();
          await new Promise((ok) => {
            const p = (n) => {
              const k = Math.min(1, (n - t0) / 1800);
              s.scrollTop =
                de + (ate - de) * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
              k < 1 ? requestAnimationFrame(p) : ok();
            };
            requestAnimationFrame(p);
          });
        });
        await page.waitForTimeout(1800);
      }
    }
    if (!adicionou) {
      // sem fluxo de pedido disponível: termina mostrando mais do cardápio
      await rolar(page, (await page.evaluate(() => scrollY)) + 900, 3200);
      await page.waitForTimeout(1500);
      await rolar(page, (await page.evaluate(() => scrollY)) + 700, 2600);
      await page.waitForTimeout(1200);
    }

    const quadros = await cap.parar();
    await ctx.close();
    const saida = montar(c, dir, quadros);
    rmSync(dir, { recursive: true, force: true });

    c.video = {
      mp4: `/vitrine/${c.slug}/demo.mp4`,
      webm: saida.webm ? `/vitrine/${c.slug}/demo.webm` : null,
      poster: `/vitrine/${c.slug}/poster.webp`,
      largura: SAIDA.w,
      altura: SAIDA.h,
      duracao: saida.duracao,
      tamanhoKB: saida.kb,
      gravadoEm: new Date().toISOString(),
      versaoRoteiro: VERSAO_ROTEIRO,
      captura: {
        largura: VIEW.width * DPR,
        altura: VIEW.height * DPR,
        quadrosPorSegundo: saida.fpsCaptura,
      },
      etapas,
      lojaFechadaNaGravacao: fechada,
    };
    log(
      `${c.slug}: ${saida.duracao}s · ${saida.kb} KB · ${etapas.join(" → ")} · captura ${saida.fpsCaptura} q/s · ${bloqueadas} envio(s) bloqueado(s)`,
    );
    return { etapas, mb: Math.round(saida.kb / 10.24) / 100 };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** No modelo por categoria: o botão "N produtos" com mais itens. */
async function maiorCategoria(page) {
  const cats = page.getByRole("button", { name: /\d+\s*produtos?/i });
  const n = await cats.count();
  let melhor = null,
    maior = 0;
  for (let i = 0; i < n; i++) {
    const qtd = Number(((await cats.nth(i).innerText()).match(/(\d+)\s*produtos?/i) ?? [])[1] ?? 0);
    if (qtd > maior) {
      maior = qtd;
      melhor = cats.nth(i);
    }
  }
  return melhor;
}

/** Produto que a demonstração adiciona: o 1º "Adicionar" de um item com foto, senão o 1º "Adicionar". */
async function escolherProduto(page) {
  const botoes = page.getByRole("button", { name: /^\s*\+?\s*adicionar\s*$/i });
  const n = await botoes.count();
  if (!n) return null;
  for (let i = 0; i < Math.min(n, 30); i++) {
    const comFoto = await botoes.nth(i).evaluate((b) => {
      let el = b;
      for (let k = 0; k < 6 && el; k++, el = el.parentElement)
        if (el.querySelector("img")) return true;
      return false;
    });
    if (comFoto) return botoes.nth(i);
  }
  return botoes.first();
}

async function rolar(page, ate, ms) {
  await page.evaluate(
    ([ate, ms]) =>
      new Promise((ok) => {
        const de = scrollY,
          t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const p = (n) => {
          const k = Math.min(1, (n - t0) / ms);
          scrollTo(0, de + (ate - de) * ease(k));
          k < 1 ? requestAnimationFrame(p) : ok();
        };
        requestAnimationFrame(p);
      }),
    [Math.max(0, ate), ms],
  );
}

/** Toque com marcador discreto (só na gravação), sem movimentos robóticos de cursor. */
async function tocar(page, loc) {
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("elemento fora da tela");
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.evaluate(
    ([x, y]) => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "fixed",
        left: `${x - 20}px`,
        top: `${y - 20}px`,
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: "rgba(255,255,255,.5)",
        border: "2px solid rgba(255,255,255,.9)",
        boxShadow: "0 2px 12px rgba(0,0,0,.3)",
        pointerEvents: "none",
        zIndex: 2147483647,
        transform: "scale(.6)",
        transition: "transform 380ms ease-out, opacity 420ms ease-out",
      });
      document.body.appendChild(d);
      requestAnimationFrame(() => {
        d.style.transform = "scale(1.15)";
        d.style.opacity = "0";
      });
      setTimeout(() => d.remove(), 520);
    },
    [x, y],
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
}

async function iniciarCaptura(page, dir) {
  const cdp = await page.context().newCDPSession(page);
  const quadros = [],
    escritas = [];
  let n = 0,
    parado = false;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (parado) return;
    const f = join(dir, `q${String(n++).padStart(5, "0")}.jpg`);
    quadros.push({ f, t: metadata.timestamp });
    escritas.push(writeFile(f, Buffer.from(data, "base64")));
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: VIEW.width * DPR,
    maxHeight: VIEW.height * DPR,
  });
  return {
    async parar() {
      await page.waitForTimeout(150);
      parado = true;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await Promise.all(escritas);
      if (quadros.length < 60) throw new Error(`poucos quadros (${quadros.length})`);
      return quadros;
    },
  };
}

function ff(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.slice(-400)}`);
}

function montar(c, dir, quadros) {
  const lista = ["ffconcat version 1.0"];
  quadros.forEach((q, i) =>
    lista.push(
      `file '${q.f}'`,
      `duration ${(i < quadros.length - 1 ? Math.max(0.001, quadros[i + 1].t - q.t) : 0.4).toFixed(4)}`,
    ),
  );
  lista.push(`file '${quadros.at(-1).f}'`);
  writeFileSync(join(dir, "lista.txt"), `${lista.join("\n")}\n`);
  const destino = join(PUBLIC, c.slug);
  mkdirSync(destino, { recursive: true });
  const mp4 = join(destino, "demo.mp4"),
    webm = join(destino, "demo.webm"),
    poster = join(destino, "poster.webp");
  const vf = `fps=${FPS},scale=${SAIDA.w}:${SAIDA.h}:flags=lanczos,format=yuv420p`;
  ff([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(dir, "lista.txt"),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-maxrate",
    "2200k",
    "-bufsize",
    "4400k",
    "-g",
    "60",
    "-an",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  ff([
    "-i",
    mp4,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "36",
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "2",
    "-an",
    webm,
  ]);
  // WebM só fica se for pelo menos 15% menor — senão é arquivo a mais sem benefício
  const usaWebm = statSync(webm).size < statSync(mp4).size * 0.85;
  if (!usaWebm) rmSync(webm);
  ff([
    "-ss",
    "1.2",
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-vf",
    "scale=540:-2:flags=lanczos",
    "-c:v",
    "libwebp",
    "-quality",
    "78",
    poster,
  ]);
  const dur = Number(
    spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
      { encoding: "utf8" },
    ).stdout.trim(),
  );
  const fpsCaptura =
    Math.round((quadros.length / Math.max(1, quadros.at(-1).t - quadros[0].t)) * 10) / 10;
  return {
    duracao: Math.round(dur * 10) / 10,
    kb: Math.round(statSync(mp4).size / 1024),
    webm: usaWebm,
    fpsCaptura,
  };
}

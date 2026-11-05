#!/usr/bin/env node
/**
 * Diagnóstico individual dos cardápios publicados no SiteCreatorFly.
 *
 * COMO USAR
 *
 *   node scripts/diagnostico-cardapios.mjs [slug-da-loja ...]
 *
 * Sem nenhum slug, mede todas as lojas publicadas. O endereço e a chave
 * PÚBLICA do banco do site são descobertos sozinhos, abrindo o site como um
 * cliente abriria — nenhuma chave fica gravada aqui. (Se preferir informar,
 * use SITE_SUPABASE_URL e SITE_SUPABASE_KEY.)
 *
 * O QUE ELE FAZ — E O QUE NÃO FAZ
 *
 * Só LÊ o que qualquer cliente do cardápio já consegue ler: a vitrine da loja,
 * os produtos ativos e o cabeçalho (o peso) das fotos e do vídeo. Não grava
 * nada, não usa senha nem chave secreta, e não lê pedidos nem dados de
 * clientes. É o cliente-oculto que entra, olha o cardápio e anota o tempo.
 *
 * O QUE ELE RESPONDE, LOJA POR LOJA
 *
 *   - quantos produtos, categorias e bebidas;
 *   - quanto pesam a logo, a capa, o vídeo de capa e as fotos (amostra);
 *   - quantas fotos já passam pela "geladeira" do Cloudflare do FlyControl;
 *   - quanto tempo as buscas no banco levaram;
 *   - e um veredito: o que mais pesa na abertura daquele cardápio.
 *
 * Em 05/11/2026 ele mostrou que o banco NÃO era o gargalo (buscas de 0,2 a
 * 0,5 s em todas as lojas): o que separava um cardápio lento de um rápido era
 * o peso da logo (até 2,6 MB), das fotos (até 2,8 MB) e do vídeo de capa
 * (até 18 MB).
 */

import { createRequire } from "node:module";

const SITE = "https://conectfly.com.br";
const KB = 1024;
const MB = 1024 * KB;

/** O peso que um celular em 4G fraco (~1,6 Mbps) baixa por segundo. */
const BYTES_POR_SEGUNDO_4G_FRACO = 200 * KB;

async function descobrirBanco() {
  if (process.env.SITE_SUPABASE_URL && process.env.SITE_SUPABASE_KEY) {
    return { url: process.env.SITE_SUPABASE_URL, key: process.env.SITE_SUPABASE_KEY };
  }
  // O site injeta o endereço e a chave pública no próprio código da página,
  // porque o navegador do cliente precisa deles para ler o cardápio.
  let playwright;
  try {
    // `require` também acha o Playwright instalado fora do projeto.
    playwright = createRequire(import.meta.url)("playwright");
  } catch {
    throw new Error(
      "Para descobrir o banco sozinho preciso do Playwright. Ou informe SITE_SUPABASE_URL e SITE_SUPABASE_KEY.",
    );
  }
  const navegador = await playwright.chromium.launch();
  try {
    const pagina = await navegador.newPage();
    let achado = null;
    pagina.on("request", (r) => {
      if (!achado && r.url().includes(".supabase.co/rest/")) {
        achado = { url: new URL(r.url()).origin, key: r.headers()["apikey"] };
      }
    });
    await pagina.goto(`${SITE}/loja-que-nao-existe-diagnostico`, { waitUntil: "networkidle" });
    if (!achado) throw new Error("Não consegui descobrir o banco do site.");
    return achado;
  } finally {
    await navegador.close();
  }
}

function criarLeitor({ url, key }) {
  const cabecalhos = { apikey: key, Authorization: `Bearer ${key}` };
  return async (caminho) => {
    const inicio = performance.now();
    const r = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos });
    const texto = await r.text();
    return {
      ms: Math.round(performance.now() - inicio),
      bytes: texto.length,
      dados: r.ok ? JSON.parse(texto) : [],
    };
  };
}

/** Peso de um arquivo sem baixá-lo inteiro. */
async function peso(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { method: "HEAD" });
    const n = Number(r.headers.get("content-length"));
    return r.ok && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const kb = (b) => (b == null ? null : Math.round(b / KB));

function veredito(l) {
  const problemas = [];
  if (l.videoKB && l.videoKB * KB > 5 * MB) {
    problemas.push(`vídeo de capa de ${(l.videoKB / 1024).toFixed(1).replace(".", ",")} MB`);
  }
  if (l.logoKB && l.logoKB > 400) problemas.push(`logo de ${l.logoKB} KB`);
  if (l.capaKB && l.capaKB > 900) problemas.push(`capa de ${l.capaKB} KB`);
  if (l.fotoMaiorKB && l.fotoMaiorKB > 300)
    problemas.push(`foto de produto de ${l.fotoMaiorKB} KB`);
  if (l.msBusca > 1500) problemas.push(`busca no banco lenta (${l.msBusca} ms)`);
  return problemas.length ? problemas.join("; ") : "ok";
}

async function main() {
  const banco = await descobrirBanco();
  const ler = criarLeitor(banco);
  const filtro = process.argv.slice(2);

  const lojas = (
    await ler(
      "pizzerias_public?select=id,slug,hero_media_type,logo_url,hero_image_url,hero_video_url&published=eq.true",
    )
  ).dados.filter((l) => filtro.length === 0 || filtro.includes(l.slug));

  const resultado = [];
  for (const loja of lojas) {
    const [itens, categorias, bebidas] = await Promise.all([
      ler(`menu_items?select=id,image_url&restaurant_id=eq.${loja.id}&is_active=eq.true`),
      ler(`menu_categories?select=id,image_url&restaurant_id=eq.${loja.id}&is_active=eq.true`),
      ler(`pizzeria_beverages?select=id,image_url&pizzeria_id=eq.${loja.id}&is_active=eq.true`),
    ]);
    const fotos = [...itens.dados, ...categorias.dados, ...bebidas.dados]
      .map((x) => x.image_url)
      .filter(Boolean);
    const amostra = (await Promise.all(fotos.slice(0, 8).map(peso))).filter((n) => n != null);
    const video = loja.hero_media_type === "video" ? await peso(loja.hero_video_url) : null;
    const linha = {
      loja: loja.slug,
      produtos: itens.dados.length,
      categorias: categorias.dados.length,
      bebidas: bebidas.dados.length,
      fotos: fotos.length,
      fotosNaGeladeira: fotos.filter((u) => u.includes("flycontrol.conectfly.com.br")).length,
      logoKB: kb(await peso(loja.logo_url)),
      capaKB: kb(await peso(loja.hero_image_url)),
      videoKB: kb(video),
      fotoMediaKB: amostra.length ? kb(amostra.reduce((a, b) => a + b, 0) / amostra.length) : null,
      fotoMaiorKB: amostra.length ? kb(Math.max(...amostra)) : null,
      msBusca: Math.max(itens.ms, categorias.ms, bebidas.ms),
    };
    const essencial =
      (linha.logoKB ?? 0) +
      (linha.capaKB ?? 0) +
      (linha.fotoMediaKB ?? 0) * Math.min(4, fotos.length);
    linha.segundosAteOEssencial4G = +((essencial * KB) / BYTES_POR_SEGUNDO_4G_FRACO).toFixed(1);
    linha.veredito = veredito(linha);
    resultado.push(linha);
  }

  resultado.sort((a, b) => b.segundosAteOEssencial4G - a.segundosAteOEssencial4G);
  console.table(resultado);
  console.log(
    "\nsegundosAteOEssencial4G = tempo estimado para baixar logo + capa + 4 primeiras fotos num 4G fraco.",
  );
  console.log(
    "Lojas com problema:",
    resultado.filter((l) => l.veredito !== "ok").length,
    "de",
    resultado.length,
  );
}

main().catch((erro) => {
  console.error("Não consegui fazer o diagnóstico:", erro.message);
  process.exit(1);
});

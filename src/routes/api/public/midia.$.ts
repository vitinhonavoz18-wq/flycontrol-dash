import { createFileRoute } from "@tanstack/react-router";
import { ORIGEM_DAS_MIDIAS, PREFIXO_DA_ROTA, enderecoDeOrigem } from "@/lib/midia/enderecoComCache";

/**
 * A "geladeira" das fotos e vídeos do cardápio (ver
 * `src/lib/midia/enderecoComCache.ts`).
 *
 * Primeira visita a uma foto: busca no Supabase UMA vez e guarda no cache do
 * Cloudflare. Da segunda em diante: entrega da cópia guardada, sem tocar no
 * Supabase — e sem gastar a franquia mensal dele.
 *
 * Vídeo: o celular pede o vídeo em pedaços ("me dá do segundo 3 ao 6"). O
 * cache do Cloudflare sabe cortar esses pedaços sozinho a partir do arquivo
 * inteiro guardado, então aqui sempre buscamos e guardamos o arquivo inteiro.
 */

const UM_ANO = 60 * 60 * 24 * 365;

/**
 * Só foto e vídeo passam. Se alguém subisse uma página da internet disfarçada
 * de foto, ela NÃO seria aberta com o endereço do FlyControl — senão viraria
 * uma página falsa "assinada" pelo nosso domínio.
 */
function tipoPermitido(tipo: string | null): boolean {
  const t = (tipo ?? "").toLowerCase().split(";")[0].trim();
  if (t === "image/svg+xml") return false; // SVG pode carregar código.
  return t.startsWith("image/") || t.startsWith("video/");
}

function cabecalhosDeEntrega(origem: Response): Headers {
  const h = new Headers();
  for (const nome of ["content-type", "content-length", "etag", "last-modified"]) {
    const v = origem.headers.get(nome);
    if (v) h.set(nome, v);
  }
  // O nome de cada arquivo é único e nunca muda de conteúdo: pode guardar
  // por um ano, no Cloudflare e no celular do cliente.
  h.set("cache-control", `public, max-age=${UM_ANO}, immutable`);
  h.set("accept-ranges", "bytes");
  h.set("access-control-allow-origin", "*");
  h.set("x-content-type-options", "nosniff");
  h.set("content-security-policy", "default-src 'none'; sandbox");
  h.set("cross-origin-resource-policy", "cross-origin");
  return h;
}

function cacheDoCloudflare(): Cache | null {
  try {
    const c = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

export async function entregar(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // O caminho cru, do jeito que chegou — sem decodificar — para a etiqueta
  // do cache e o endereço no Supabase serem exatamente os mesmos.
  const trecho = url.pathname.startsWith(PREFIXO_DA_ROTA)
    ? url.pathname.slice(PREFIXO_DA_ROTA.length)
    : "";
  const origemUrl = enderecoDeOrigem(trecho, url.search);
  if (!origemUrl) return new Response("Não encontrado", { status: 404 });

  // A "etiqueta" da prateleira: sempre o mesmo endereço limpo, para que
  // variações do link (parâmetros extras, outro domínio) usem a mesma cópia.
  const busca = new URL(origemUrl).search;
  const chave = new Request(`${ORIGEM_DAS_MIDIAS}${PREFIXO_DA_ROTA}${trecho}${busca}`, {
    method: "GET",
  });
  const pedidoNoCache = new Request(chave.url, { method: "GET", headers: request.headers });

  const cache = cacheDoCloudflare();
  if (cache) {
    const guardado = await cache.match(pedidoNoCache);
    if (guardado) return guardado;
  }

  const resposta = await fetch(origemUrl, {
    method: "GET",
    // Também pede ao Cloudflare para guardar a busca no Supabase — uma
    // segunda camada de proteção, caso a primeira não esteja disponível.
    cf: { cacheEverything: true, cacheTtl: UM_ANO },
  } as RequestInit);

  if (!resposta.ok) {
    // Erro não vai para o cache: se o Supabase estiver fora do ar, a próxima
    // visita tenta de novo em vez de ficar presa no erro.
    return new Response("Arquivo indisponível", {
      status: resposta.status === 404 || resposta.status === 400 ? 404 : 502,
      headers: { "cache-control": "no-store" },
    });
  }
  if (!tipoPermitido(resposta.headers.get("content-type"))) {
    return new Response("Tipo de arquivo não permitido", { status: 415 });
  }

  const pronta = new Response(resposta.body, {
    status: 200,
    headers: cabecalhosDeEntrega(resposta),
  });

  if (!cache) return pronta;

  try {
    await cache.put(chave, pronta.clone());
    // Com a cópia guardada, o próprio cache responde — e já corta o pedaço
    // certo quando o celular pediu só uma parte do vídeo.
    const doCache = await cache.match(pedidoNoCache);
    if (doCache) return doCache;
  } catch (erro) {
    console.warn("[midia] não consegui guardar no cache:", erro);
  }
  return pronta;
}

export const Route = createFileRoute("/api/public/midia/$")({
  server: {
    handlers: {
      GET: async ({ request }) => entregar(request),
    },
  },
});

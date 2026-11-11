import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseKey, normalizeSupabaseUrl } from "@/integrations/supabase/env";
import { paraEnderecoComCache } from "@/lib/midia/enderecoComCache";
import { TIPOS_DE_COMIDA, type ItemDaVitrine, type TipoDeComida } from "@/lib/vitrine/vitrine";

/**
 * A LISTA DE PRODUTOS DA VITRINE DO TOPO DO SITE.
 *
 * Endereço público, sem login: é a página inicial que o visitante abre.
 *
 * O QUE ELE DEVOLVE
 *
 * Só o necessário para desenhar a vitrine: nome do produto, tipo de comida,
 * endereço do recorte e medidas. Nada de loja, preço ou quem cadastrou. Quem
 * escolhe o que sai é a função `hero_showcase_public()` no banco, com a chave
 * PÚBLICA (a mesma do navegador) — as regras de acesso do banco valem aqui
 * também. A chave de serviço não é usada.
 *
 * POR QUE TEM CACHE
 *
 * A lista muda raramente (quando a equipe aprova um produto) e a página
 * inicial é aberta muitas vezes. A resposta fica guardada na Cloudflare por
 * 10 minutos: mil visitantes nesse intervalo geram UMA consulta ao banco. É o
 * cardápio impresso na porta: ninguém vai à cozinha perguntar o prato do dia
 * a cada cliente que passa.
 */

const CACHE_OK = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400";
const CACHE_FALHA = "public, max-age=30, s-maxage=60";

function endereco(base: string, caminho: string | null): string | null {
  if (!caminho) return null;
  const limpo = caminho.replace(/^\/+/, "");
  if (!limpo || limpo.split("/").some((p) => p === ".." || p === ".")) return null;
  const caminhoCodificado = limpo.split("/").map(encodeURIComponent).join("/");
  return paraEnderecoComCache(
    `${base}/storage/v1/object/public/hero-showcase/${caminhoCodificado}`,
  );
}

function responder(itens: ItemDaVitrine[], cache: string, status = 200): Response {
  return new Response(JSON.stringify({ itens }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function listarVitrine(): Promise<Response> {
  const url = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const chave = normalizeSupabaseKey(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
  );
  if (!url || !chave) {
    console.error("[vitrine-hero] Endereço ou chave pública do Supabase ausentes.");
    return responder([], CACHE_FALHA);
  }

  try {
    const supabase = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("hero_showcase_public");
    if (error) throw new Error(error.message);

    const itens: ItemDaVitrine[] = [];
    for (const linha of data ?? []) {
      const imagem = endereco(url, linha.imagem);
      if (!imagem) continue;
      itens.push({
        id: linha.id,
        nome: linha.nome,
        tipo: TIPOS_DE_COMIDA.includes(linha.tipo as TipoDeComida)
          ? (linha.tipo as TipoDeComida)
          : "outro",
        imagem,
        imagemPequena: endereco(url, linha.imagem_pequena) ?? imagem,
        largura: linha.largura ?? 1000,
        altura: linha.altura ?? 1000,
        preenchimento: Number(linha.preenchimento ?? 0.6),
      });
    }
    return responder(itens, CACHE_OK);
  } catch (erro) {
    // O visitante não vê erro nenhum: a vitrine mostra o produto reserva.
    // O registro fica para quem for investigar.
    console.error("[vitrine-hero] Falha ao ler a vitrine:", (erro as Error).message);
    return responder([], CACHE_FALHA);
  }
}

export const Route = createFileRoute("/api/public/vitrine-hero")({
  server: {
    handlers: {
      GET: () => listarVitrine(),
    },
  },
});

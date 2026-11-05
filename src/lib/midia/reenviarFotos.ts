import { supabase } from "@/integrations/supabase/client";
import { syncToExternal } from "@/utils/menuSync";
import { paraEnderecoComCache } from "./enderecoComCache";

/**
 * "Reenviar fotos": troca, de uma vez, o endereço de TODAS as fotos que o
 * site de pedidos já tinha recebido antes da "geladeira" do Cloudflare
 * existir (ver `enderecoComCache.ts`).
 *
 * Sem isto, cada foto antiga só passava a sair do cache quando o lojista
 * abrisse e salvasse o item de novo — um por um. Com isto, é um clique.
 *
 * O QUE VAI E O QUE NÃO VAI
 *
 * Só reenvia o item cuja foto REALMENTE muda de endereço. Item sem foto, ou
 * com foto de outro lugar, fica quieto: não há por que mexer.
 *
 * Cada item vai com os dados completos que já estão no FlyControl (nome,
 * preço, descrição, ativo...), exatamente como se o lojista tivesse aberto e
 * clicado em Salvar. Mandar só a foto não serve: o site entenderia os campos
 * ausentes como "em branco" em alguns casos (a descrição da categoria, os
 * itens do combo) e apagaria o que está certo.
 *
 * Da loja (logo, capa, vídeo), vai SÓ o campo da foto — ali o site grava
 * apenas o que recebe, então mandar menos é mais seguro.
 */

export type ResultadoDoReenvio = {
  enviados: number;
  falhas: number;
  /** Nomes dos itens que não foram, para a tela mostrar ao lojista. */
  itensComFalha: string[];
};

type Loja = {
  id: string;
  slug: string | null;
  api_key: string | null;
  sync_endpoint: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
};

type Tarefa = { nome: string; enviar: () => Promise<boolean> };

/** A foto muda de endereço? Só então vale reenviar. */
export function fotoMuda(url: unknown): boolean {
  return typeof url === "string" && url !== "" && paraEnderecoComCache(url) !== url;
}

/** Envia poucos por vez, para não derrubar o site com uma enxurrada. */
async function executarAosPoucos(tarefas: Tarefa[], aoAvancar?: (feitos: number) => void) {
  const resultado: ResultadoDoReenvio = { enviados: 0, falhas: 0, itensComFalha: [] };
  let proximo = 0;
  let feitos = 0;
  const LEVA = 3;

  async function trabalhador() {
    while (proximo < tarefas.length) {
      const tarefa = tarefas[proximo++];
      let ok = false;
      try {
        ok = await tarefa.enviar();
      } catch {
        ok = false;
      }
      if (ok) resultado.enviados++;
      else {
        resultado.falhas++;
        resultado.itensComFalha.push(tarefa.nome);
      }
      feitos++;
      aoAvancar?.(feitos);
    }
  }

  await Promise.all(Array.from({ length: Math.min(LEVA, tarefas.length) }, trabalhador));
  return resultado;
}

function semPrefixoDeCategoria(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.startsWith("sf_cat_") ? id.slice("sf_cat_".length) : id;
}

/**
 * Monta a lista do que precisa ser reenviado. Separado do envio para a tela
 * poder dizer "vou reenviar 37 fotos" antes de começar.
 */
export async function montarReenvio(pizzeriaId: string): Promise<{
  tarefas: Tarefa[];
  erro?: string;
}> {
  const { data: lojaRaw, error: erroLoja } = await supabase
    .from("pizzerias")
    .select("id, slug, api_key, sync_endpoint, logo_url, hero_image_url, hero_video_url")
    .eq("id", pizzeriaId)
    .single();
  if (erroLoja || !lojaRaw) return { tarefas: [], erro: "Não encontrei os dados da loja." };
  const loja = lojaRaw as unknown as Loja;
  if (!loja.slug || !loja.api_key || !loja.sync_endpoint) {
    return { tarefas: [], erro: "O cardápio online desta loja ainda não está conectado." };
  }

  const credenciais = {
    pizzeriaSlug: loja.slug,
    pizzeriaApiKey: loja.api_key,
    syncEndpoint: loja.sync_endpoint,
  };

  const [categorias, produtos, combos] = await Promise.all([
    supabase.from("menu_categories").select("*").eq("pizzeria_id", pizzeriaId),
    supabase.from("menu_products").select("*").eq("pizzeria_id", pizzeriaId),
    supabase.from("combos").select("*, combo_items(*)").eq("pizzeria_id", pizzeriaId),
  ]);
  const erroLista = categorias.error ?? produtos.error ?? combos.error;
  if (erroLista) return { tarefas: [], erro: "Não consegui ler o cardápio: " + erroLista.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listaCategorias = (categorias.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listaProdutos = (produtos.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listaCombos = (combos.data ?? []) as any[];

  const tarefas: Tarefa[] = [];

  // 1. A loja: logo, capa e vídeo — os arquivos mais pesados, vão primeiro.
  const camposDaLoja: Record<string, string> = {};
  for (const campo of ["logo_url", "hero_image_url", "hero_video_url"] as const) {
    if (fotoMuda(loja[campo])) camposDaLoja[campo] = loja[campo]!;
  }
  if (Object.keys(camposDaLoja).length > 0) {
    tarefas.push({
      nome: "Logo, capa e vídeo da loja",
      enviar: async () =>
        (
          await syncToExternal({
            type: "restaurant",
            action: "update",
            id: loja.id,
            data: camposDaLoja,
            ...credenciais,
          })
        ).success,
    });
  }

  // 2. Categorias.
  for (const c of listaCategorias) {
    if (!c.external_id || !fotoMuda(c.image_url)) continue;
    tarefas.push({
      nome: `Categoria "${c.name}"`,
      enviar: async () =>
        (
          await syncToExternal({
            type: "category",
            action: "update",
            id: c.id,
            externalId: c.external_id,
            data: {
              name: c.name,
              description: c.description,
              image_url: c.image_url,
              order_index: c.order_index,
              active: c.active,
            },
            ...credenciais,
          })
        ).success,
    });
  }

  // 3. Produtos, bebidas e sabores.
  const categoriaPorId = new Map(listaCategorias.map((c) => [c.id, c]));
  for (const p of listaProdutos) {
    if (!p.external_id || !fotoMuda(p.image_url)) continue;
    const bebida = p.product_type === "beverage";
    const externalCategoryId = semPrefixoDeCategoria(
      categoriaPorId.get(p.category_id)?.external_id,
    );
    tarefas.push({
      nome: `${bebida ? "Bebida" : "Produto"} "${p.name}"`,
      enviar: async () => {
        // Produto sem categoria conectada ao site: o próprio Salvar da tela
        // recusa. Aqui também — melhor avisar do que mandar torto.
        if (!bebida && !externalCategoryId) return false;
        return (
          await syncToExternal({
            type: p.product_type,
            action: "update",
            id: p.id,
            externalId: p.external_id,
            data: {
              name: p.name,
              description: p.description,
              price: p.price,
              image_url: p.image_url,
              active: p.active,
              max_extras: p.max_extras,
              external_category_id: externalCategoryId ?? undefined,
            },
            ...credenciais,
          })
        ).success;
      },
    });
  }

  // 4. Combos — com os itens, senão o site apagaria o que vem no combo.
  for (const cb of listaCombos) {
    if (!cb.external_id || !fotoMuda(cb.image_url)) continue;
    tarefas.push({
      nome: `Combo "${cb.name}"`,
      enviar: async () =>
        (
          await syncToExternal({
            type: "combo",
            action: "update",
            id: cb.id,
            externalId: cb.external_id,
            data: {
              name: cb.name,
              description: cb.description,
              original_price: cb.original_price,
              combo_price: cb.combo_price,
              image_url: cb.image_url,
              active: cb.active,
              highlight: cb.highlight,
              available_days: cb.available_days,
              start_time: cb.start_time,
              end_time: cb.end_time,
              items: cb.combo_items ?? [],
            },
            ...credenciais,
          })
        ).success,
    });
  }

  return { tarefas };
}

export async function reenviarTarefas(
  tarefas: Tarefa[],
  aoAvancar?: (feitos: number) => void,
): Promise<ResultadoDoReenvio> {
  return executarAosPoucos(tarefas, aoAvancar);
}

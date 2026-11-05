import { supabase } from "@/integrations/supabase/client";
import { syncToExternal } from "@/utils/menuSync";
import { paraEnderecoComCache } from "./enderecoComCache";
import { comprimirParaWebp, LIMITE_PRODUTO } from "@/lib/imagem/comprimir";
import { LIMITE_CAPA, LIMITE_LOGO } from "@/lib/imagem/medidas";
import { enviarFotoDoCardapio } from "@/lib/imagem/enviarFoto";
import { formatarPeso, PESO_DE_VIDEO_RECOMENDADO } from "./peso";

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
 *
 * FOTOS PESADAS (opção `otimizar`)
 *
 * Medido nos cardápios publicados em 05/11/2026: logos de 1,7 a 2,6 MB e
 * fotos de produto de até 2,8 MB, enviadas antes de o FlyControl encolher as
 * fotos no envio. Num celular com 4G fraco, uma logo de 2,6 MB leva mais de
 * 10 segundos para aparecer — e ela é justamente o primeiro destaque da tela.
 *
 * Com `otimizar`, cada foto acima do peso razoável é baixada, encolhida no
 * navegador do lojista (mesma régua do envio normal), guardada como arquivo
 * novo, mandada para o site e só ENTÃO trocada no FlyControl. A foto antiga
 * não é apagada: se algo der errado no meio, o cardápio continua com a foto
 * que já tinha, nunca fica sem foto.
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

export type OpcoesDoReenvio = {
  /** Também encolhe as fotos pesadas (ver comentário do topo). */
  otimizar?: boolean;
};

/** Tipo de foto: decide até que tamanho encolher e o peso aceitável. */
type TipoDeFoto = "produto" | "logo" | "capa";

/**
 * Acima disso a foto é considerada pesada. Uma foto de produto bem guardada
 * (900 pontos, WebP) pesa 60–150 KB; logo, 100–250 KB; capa, 300–600 KB.
 * A folga evita mexer em foto que já está boa.
 */
export const PESO_MAXIMO: Record<TipoDeFoto, number> = {
  produto: 300 * 1024,
  logo: 400 * 1024,
  capa: 900 * 1024,
};

const LIMITE_DO_TIPO: Record<TipoDeFoto, number> = {
  produto: LIMITE_PRODUTO,
  logo: LIMITE_LOGO,
  capa: LIMITE_CAPA,
};

/**
 * O peso do arquivo, perguntado sem baixá-lo (só o "cabeçalho"). Nulo quando
 * o servidor não informa — aí a foto fica como está.
 */
export async function pesoDoArquivo(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!r.ok) return null;
    const n = Number(r.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Faz no máximo `n` coisas ao mesmo tempo. */
async function aosPoucos<T>(itens: T[], n: number, fazer: (item: T) => Promise<void>) {
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) await fazer(itens[proximo++]);
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
}

/**
 * Baixa a foto pesada, encolhe e guarda a versão nova. Devolve o endereço
 * novo — ou o antigo, se não deu para melhorar (aí nada muda).
 */
async function otimizarFoto(url: string, tipo: TipoDeFoto): Promise<string> {
  const resposta = await fetch(url, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`não consegui baixar a foto (${resposta.status})`);
  const original = await resposta.blob();
  const nova = await comprimirParaWebp(original, LIMITE_DO_TIPO[tipo], { forcar: true });
  if (nova === original) return url;
  return enviarFotoDoCardapio(nova, `otimizadas/${tipo}`);
}

/**
 * O que fazer com cada foto. Montado antes de enviar, para a tela poder
 * dizer "vou otimizar 6 fotos" e pedir confirmação.
 */
type Plano = { otimizar: Set<string>; avisos: string[]; pesadas: number; pesoEconomizavel: number };

async function planejar(
  fotos: { url: unknown; tipo: TipoDeFoto }[],
  video: unknown,
  opcoes: OpcoesDoReenvio,
): Promise<Plano> {
  const plano: Plano = { otimizar: new Set(), avisos: [], pesadas: 0, pesoEconomizavel: 0 };
  if (!opcoes.otimizar) return plano;

  const unicas = new Map<string, TipoDeFoto>();
  for (const f of fotos) if (typeof f.url === "string" && f.url) unicas.set(f.url, f.tipo);

  await aosPoucos([...unicas], 6, async ([url, tipo]) => {
    const peso = await pesoDoArquivo(url);
    if (peso !== null && peso > PESO_MAXIMO[tipo]) {
      plano.otimizar.add(url);
      plano.pesadas++;
      plano.pesoEconomizavel += peso;
    }
  });

  if (typeof video === "string" && video) {
    const peso = await pesoDoArquivo(video);
    if (peso !== null && peso > PESO_DE_VIDEO_RECOMENDADO) {
      plano.avisos.push(
        `O vídeo de capa tem ${formatarPeso(peso)}. Num celular com 4G fraco isso leva ` +
          `cerca de ${Math.round(peso / (200 * 1024))} segundos para baixar inteiro. ` +
          "Recomendamos um vídeo de até 5 MB (10 a 15 segundos, sem som).",
      );
    }
  }
  return plano;
}

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
export async function montarReenvio(
  pizzeriaId: string,
  opcoes: OpcoesDoReenvio = {},
): Promise<{
  tarefas: Tarefa[];
  erro?: string;
  /** Quantas fotos pesadas serão encolhidas. */
  pesadas?: number;
  /** Avisos para o lojista (ex.: vídeo de capa pesado demais). */
  avisos?: string[];
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

  const plano = await planejar(
    [
      { url: loja.logo_url, tipo: "logo" },
      { url: loja.hero_image_url, tipo: "capa" },
      ...listaCategorias
        .filter((c) => c.external_id)
        .map((c) => ({ url: c.image_url, tipo: "produto" as const })),
      ...listaProdutos
        .filter((p) => p.external_id)
        .map((p) => ({ url: p.image_url, tipo: "produto" as const })),
      ...listaCombos
        .filter((c) => c.external_id)
        .map((c) => ({ url: c.image_url, tipo: "produto" as const })),
    ],
    loja.hero_video_url,
    opcoes,
  );

  /** A foto entra no reenvio? Muda de endereço, ou é pesada e vai ser encolhida. */
  const precisa = (url: unknown) =>
    fotoMuda(url) || (typeof url === "string" && plano.otimizar.has(url));

  /**
   * O endereço que vai para o site: o da foto encolhida (quando ela era
   * pesada) ou o mesmo de sempre.
   */
  const fotoFinal = async (url: string | null | undefined, tipo: TipoDeFoto) =>
    url && plano.otimizar.has(url) ? otimizarFoto(url, tipo) : (url ?? null);

  /**
   * Depois que o SITE aceitou a foto nova, grava no FlyControl também. Nessa
   * ordem de propósito: se o site recusar, o FlyControl continua igual ao
   * site e a próxima tentativa refaz tudo.
   */
  const gravarNoPainel = async (
    tabela: "pizzerias" | "menu_categories" | "menu_products" | "combos",
    id: string,
    campos: Record<string, string | null>,
  ) => {
    if (Object.keys(campos).length === 0) return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(tabela) as any).update(campos).eq("id", id);
    if (error) console.warn(`[ReenviarFotos] site atualizado, painel não (${tabela}):`, error);
    return !error;
  };

  const tarefas: Tarefa[] = [];

  // 1. A loja: logo, capa e vídeo — os arquivos mais pesados, vão primeiro.
  const tipoDoCampo = { logo_url: "logo", hero_image_url: "capa" } as const;
  const camposDaLoja = (["logo_url", "hero_image_url", "hero_video_url"] as const).filter((campo) =>
    precisa(loja[campo]),
  );
  if (camposDaLoja.length > 0) {
    tarefas.push({
      nome: "Logo, capa e vídeo da loja",
      enviar: async () => {
        const dados: Record<string, string> = {};
        const trocados: Record<string, string> = {};
        for (const campo of camposDaLoja) {
          const atual = loja[campo]!;
          const final =
            campo === "hero_video_url" ? atual : await fotoFinal(atual, tipoDoCampo[campo]);
          dados[campo] = final!;
          if (final !== atual) trocados[campo] = final!;
        }
        const ok = (
          await syncToExternal({
            type: "restaurant",
            action: "update",
            id: loja.id,
            data: dados,
            ...credenciais,
          })
        ).success;
        return ok && (await gravarNoPainel("pizzerias", loja.id, trocados));
      },
    });
  }

  // 2. Categorias.
  for (const c of listaCategorias) {
    if (!c.external_id || !precisa(c.image_url)) continue;
    tarefas.push({
      nome: `Categoria "${c.name}"`,
      enviar: async () => {
        const foto = await fotoFinal(c.image_url, "produto");
        const ok = (
          await syncToExternal({
            type: "category",
            action: "update",
            id: c.id,
            externalId: c.external_id,
            data: {
              name: c.name,
              description: c.description,
              image_url: foto,
              order_index: c.order_index,
              active: c.active,
            },
            ...credenciais,
          })
        ).success;
        return (
          ok &&
          (foto === c.image_url ||
            (await gravarNoPainel("menu_categories", c.id, { image_url: foto })))
        );
      },
    });
  }

  // 3. Produtos, bebidas e sabores.
  const categoriaPorId = new Map(listaCategorias.map((c) => [c.id, c]));
  for (const p of listaProdutos) {
    if (!p.external_id || !precisa(p.image_url)) continue;
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
        const foto = await fotoFinal(p.image_url, "produto");
        const ok = (
          await syncToExternal({
            type: p.product_type,
            action: "update",
            id: p.id,
            externalId: p.external_id,
            data: {
              name: p.name,
              description: p.description,
              price: p.price,
              image_url: foto,
              active: p.active,
              max_extras: p.max_extras,
              external_category_id: externalCategoryId ?? undefined,
            },
            ...credenciais,
          })
        ).success;
        return (
          ok &&
          (foto === p.image_url ||
            (await gravarNoPainel("menu_products", p.id, { image_url: foto })))
        );
      },
    });
  }

  // 4. Combos — com os itens, senão o site apagaria o que vem no combo.
  for (const cb of listaCombos) {
    if (!cb.external_id || !precisa(cb.image_url)) continue;
    tarefas.push({
      nome: `Combo "${cb.name}"`,
      enviar: async () => {
        const foto = await fotoFinal(cb.image_url, "produto");
        const ok = (
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
              image_url: foto,
              active: cb.active,
              highlight: cb.highlight,
              available_days: cb.available_days,
              start_time: cb.start_time,
              end_time: cb.end_time,
              items: cb.combo_items ?? [],
            },
            ...credenciais,
          })
        ).success;
        return (
          ok &&
          (foto === cb.image_url || (await gravarNoPainel("combos", cb.id, { image_url: foto })))
        );
      },
    });
  }

  return { tarefas, pesadas: plano.pesadas, avisos: plano.avisos };
}

export async function reenviarTarefas(
  tarefas: Tarefa[],
  aoAvancar?: (feitos: number) => void,
): Promise<ResultadoDoReenvio> {
  return executarAosPoucos(tarefas, aoAvancar);
}

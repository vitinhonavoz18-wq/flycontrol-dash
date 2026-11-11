/**
 * AS REGRAS DA VITRINE DO SITE (os alimentos que flutuam no topo da página).
 *
 * Aqui só há regra — nada de tela, banco ou rede. É o que permite testar cada
 * decisão com exemplos inventados: "três hambúrgueres seguidos viram
 * hambúrguer, pizza, hambúrguer", "uma pizza não aparece maior que um pastel".
 *
 * De onde vêm os produtos: da lista `hero_showcase_items`, escolhida pela
 * equipe da plataforma (ver a migração `vitrine_do_site`). O site lê essa
 * lista pelo endereço `/api/public/vitrine-hero`, que guarda a resposta em
 * cache por alguns minutos — o banco não é consultado a cada visitante, e
 * muito menos a cada troca de produto.
 */

import hamburguerGrande from "@/assets/vitrine/hamburguer-recorte.webp";
import hamburguerPequeno from "@/assets/vitrine/hamburguer-recorte-640.webp";

/** Os tipos de comida que a vitrine sabe alternar. */
export const TIPOS_DE_COMIDA = [
  "hamburguer",
  "pizza",
  "acai",
  "pastel",
  "japonesa",
  "salgado",
  "doce",
  "prato",
  "lanche",
  "outro",
] as const;
export type TipoDeComida = (typeof TIPOS_DE_COMIDA)[number];

export type ItemDaVitrine = {
  id: string;
  /** Nome do produto — vai como texto alternativo da imagem. */
  nome: string;
  tipo: TipoDeComida;
  /** Recorte com fundo transparente, tamanho grande (computador). */
  imagem: string;
  /** Recorte menor (celular). Na falta, usa o grande. */
  imagemPequena: string;
  largura: number;
  altura: number;
  /** Quanto da imagem é comida (0..1). */
  preenchimento: number;
};

/** Quanto tempo cada produto fica na vitrine. */
export const INTERVALO_DA_VITRINE_MS = 3000;
/** Duração da troca entre um produto e outro (cabe dentro dos 3 segundos). */
export const DURACAO_DA_TROCA_MS = 600;

/**
 * O produto reserva: o hambúrguer da arte oficial do FlyDelivery, já
 * recortado (com o mesmo processo usado para os produtos dos cardápios).
 *
 * Aparece primeiro, na hora, sem esperar o banco — e é o que fica na tela se
 * a lista não carregar. A vitrine nunca fica vazia nem mostra imagem quebrada.
 */
export const ITEM_RESERVA: ItemDaVitrine = {
  id: "reserva-hamburguer",
  nome: "Hambúrguer artesanal",
  tipo: "hamburguer",
  imagem: hamburguerGrande,
  imagemPequena: hamburguerPequeno,
  largura: 680,
  altura: 601,
  preenchimento: 0.6234,
};

// ── Tipo de comida ─────────────────────────────────────────────────────────

const PALAVRAS: [TipoDeComida, RegExp][] = [
  ["acai", /\ba[cç]a[ií]\b|\bcupua[cç]u\b/],
  [
    "japonesa",
    /\bsushi|\bsashimi|temaki|\buramaki|\bhot ?roll|\bnigiri|\bjapones|\bpoke\b|\byakisoba/,
  ],
  ["pizza", /\bpizza|\bcalabresa\b|\bmarguerita|\bmussarela|\bportuguesa\b|\bfrango com catupiry/],
  [
    "hamburguer",
    /\bhamb[uú]rgu?er|\bburger|\bburguer|\bx-|\bx ?(bacon|salada|tudo|egg|burguer)|\bsmash/,
  ],
  ["pastel", /\bpast[eé]is|\bpastel/],
  [
    "doce",
    /\bdoce|\bbolo\b|\bbrownie|\bsobremesa|\bpudim|\bsorvete|\bmilk ?shake|\bpetit|\bbrigadeiro|\bcookie|\btorta doce/,
  ],
  [
    "salgado",
    /\bsalgad|\bcoxinha|\bempada|\bkibe|\bquibe|\besfiha|\besfirra|\bpor[cç][aã]o|\bbatata frita|\bfritas\b|\bcalzone/,
  ],
  [
    "lanche",
    /\blanche|\bsandu[ií]che|\bcachorro.quente|\bhot ?dog|\bwrap\b|\btapioca|\bcuscuz|\bbeirute/,
  ],
  [
    "prato",
    /\bprato|\bmarmita|\bmarmitex|\bfeijoada|\bparmegiana|\bfil[eé]\b|\bstrogonoff|\bpicanha|\bcarne|\bfrango|\bpeixe|\bmassa\b|\blasanha|\bmacarr/,
  ],
];

/**
 * Descobre o tipo de comida pelo nome do produto e da categoria.
 *
 * Olha primeiro o produto ("Calzone de calabresa" é salgado, mesmo dentro da
 * categoria Pizzas) e, se não reconhecer, a categoria.
 */
export function classificarComida(nome: string, categoria?: string | null): TipoDeComida {
  const limpar = (t: string) =>
    ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ç/g, "c")} `;
  for (const texto of [nome, categoria ?? ""]) {
    const t = limpar(texto);
    // A conferência é feita na forma sem acento E na forma original, para as
    // expressões com acento opcional funcionarem dos dois jeitos.
    const original = ` ${texto.toLowerCase()} `;
    for (const [tipo, re] of PALAVRAS) {
      if (re.test(t) || re.test(original)) return tipo;
    }
  }
  return "outro";
}

// ── Ordem: alternar tipos ──────────────────────────────────────────────────

/**
 * Reordena a lista para não mostrar dois produtos do mesmo tipo seguidos.
 *
 * Respeita a ordem escolhida pela equipe sempre que possível: só "puxa para
 * a frente" um item quando o próximo da fila repetiria o tipo do anterior. E
 * como a vitrine dá a volta, também evita que o último e o primeiro sejam do
 * mesmo tipo. Quando não há como evitar (só existem hambúrgueres), mantém.
 */
export function alternarTipos(itens: readonly ItemDaVitrine[]): ItemDaVitrine[] {
  const fila = [...itens];
  const saida: ItemDaVitrine[] = [];
  while (fila.length) {
    const anterior = saida[saida.length - 1];
    let i = fila.findIndex((it) => !anterior || it.tipo !== anterior.tipo);
    if (i < 0) i = 0;
    saida.push(fila.splice(i, 1)[0]);
  }
  // Volta da roda: último igual ao primeiro? Tenta trocar o último com algum
  // item do meio que não crie repetição nova.
  const n = saida.length;
  if (n > 2 && saida[n - 1].tipo === saida[0].tipo) {
    for (let j = 1; j < n - 1; j++) {
      const candidato = saida[j];
      const ok =
        candidato.tipo !== saida[0].tipo &&
        candidato.tipo !== saida[n - 2].tipo &&
        saida[n - 1].tipo !== saida[j - 1].tipo &&
        saida[n - 1].tipo !== saida[j + 1].tipo;
      if (ok) {
        [saida[j], saida[n - 1]] = [saida[n - 1], saida[j]];
        break;
      }
    }
  }
  return saida;
}

// ── Tamanho igualado ───────────────────────────────────────────────────────

/** Quanto da área da vitrine a comida deve ocupar, em média. */
const AREA_ALVO = 0.34;
/** Nenhum alimento passa disto da largura ou da altura da vitrine. */
const LIMITE = 0.78;

/**
 * Largura do alimento, em % da vitrine, para que todos pareçam do mesmo
 * "tamanho visual".
 *
 * Sem isso, uma pizza redonda que ocupa a foto inteira apareceria enorme ao
 * lado de um açaí fino e alto. A conta iguala a ÁREA de comida visível (não
 * o tamanho do arquivo), e depois confere se cabe na vitrine.
 *
 * `proporcaoDaVitrine` = altura ÷ largura da área onde o alimento flutua.
 */
export function larguraNormalizada(
  item: Pick<ItemDaVitrine, "largura" | "altura" | "preenchimento">,
  proporcaoDaVitrine: number,
): number {
  const aspecto = item.largura > 0 && item.altura > 0 ? item.largura / item.altura : 1;
  const preenchimento = Math.min(1, Math.max(0.2, item.preenchimento || 0.6));
  const r = proporcaoDaVitrine > 0 ? proporcaoDaVitrine : 1;
  let largura = Math.sqrt((AREA_ALVO * r * aspecto) / preenchimento);
  largura = Math.min(largura, LIMITE, LIMITE * r * aspecto);
  return Math.round(largura * 1000) / 10;
}

// ── Validação do que chega do servidor ─────────────────────────────────────

/**
 * De onde uma imagem da vitrine pode vir. Qualquer outra origem é recusada —
 * a lista vem do nosso servidor, mas conferir aqui impede que um dado
 * estragado coloque uma imagem de terceiros no topo do site.
 */
export function enderecoPermitido(url: string, origemDoSite?: string): boolean {
  try {
    const u = new URL(url, origemDoSite ?? "https://flycontrol.conectfly.com.br");
    if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) {
      return false;
    }
    if (u.pathname.startsWith("/api/public/midia/")) return true;
    return /\.supabase\.co$/.test(u.hostname) && u.pathname.includes("/hero-showcase/");
  } catch {
    return false;
  }
}

/** Confere e limpa a lista que chegou do servidor. Item estranho é descartado. */
export function normalizarVitrine(dados: unknown, origemDoSite?: string): ItemDaVitrine[] {
  const lista = (dados as { itens?: unknown })?.itens;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const saida: ItemDaVitrine[] = [];
  for (const bruto of lista.slice(0, 12)) {
    const it = bruto as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id : "";
    const imagem = typeof it.imagem === "string" ? it.imagem : "";
    if (!id || vistos.has(id) || !imagem || !enderecoPermitido(imagem, origemDoSite)) continue;
    const pequena =
      typeof it.imagemPequena === "string" && enderecoPermitido(it.imagemPequena, origemDoSite)
        ? it.imagemPequena
        : imagem;
    const largura = Number(it.largura);
    const altura = Number(it.altura);
    const tipo = TIPOS_DE_COMIDA.includes(it.tipo as TipoDeComida)
      ? (it.tipo as TipoDeComida)
      : "outro";
    vistos.add(id);
    saida.push({
      id,
      nome: typeof it.nome === "string" && it.nome.trim() ? it.nome.trim().slice(0, 80) : "Produto",
      tipo,
      imagem,
      imagemPequena: pequena,
      largura: Number.isFinite(largura) && largura > 0 ? largura : 1000,
      altura: Number.isFinite(altura) && altura > 0 ? altura : 1000,
      preenchimento: Number.isFinite(Number(it.preenchimento)) ? Number(it.preenchimento) : 0.6,
    });
  }
  return saida;
}

/**
 * A sequência final da vitrine.
 *
 * Com dois ou mais produtos de verdade, a vitrine mostra só eles. Com um só,
 * ele alterna com o hambúrguer da marca (um produto sozinho não "gira"). Sem
 * nenhum, fica o hambúrguer da marca.
 */
export function montarSequencia(
  itens: readonly ItemDaVitrine[],
  quebrados: ReadonlySet<string> = new Set(),
): ItemDaVitrine[] {
  const bons = itens.filter((it) => !quebrados.has(it.id));
  if (bons.length >= 2) return alternarTipos(bons);
  if (bons.length === 1 && !quebrados.has(ITEM_RESERVA.id)) return [ITEM_RESERVA, bons[0]];
  return [ITEM_RESERVA];
}

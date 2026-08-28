/**
 * Os layouts de cardápio que o lojista pode escolher.
 *
 * ATENÇÃO — ESTA LISTA É UMA CÓPIA
 *
 * Quem monta o cardápio de verdade é o SiteCreatorFly, em
 * `src/lib/site/menuLayout.ts` do outro projeto. Os dois sistemas são
 * separados e não compartilham código, então esta lista existe só para o
 * painel conseguir MOSTRAR as opções e dizer o que cada uma faz.
 *
 * Os identificadores (`pizza`, `pharmacy`, …) precisam ser exatamente os
 * mesmos dos dois lados: é o identificador que viaja e manda no cardápio.
 * Nome e descrição podem divergir sem estragar nada — o identificador, não.
 */

export type LayoutId =
  | "generic"
  | "pizza"
  | "burger"
  | "acai"
  | "restaurant"
  | "japanese"
  | "bakery"
  | "beverage"
  | "pharmacy"
  | "market";

export type LayoutDeCardapio = {
  id: LayoutId;
  nome: string;
  /** O que muda na prática para quem abre o cardápio. */
  descricao: string;
  /** Os blocos, na ordem, só para a prévia do painel. */
  ordem: readonly string[];
  colunas: 1 | 2 | 3 | 4;
  buscaEmDestaque: boolean;
};

export const LAYOUTS: readonly LayoutDeCardapio[] = [
  {
    id: "generic",
    nome: "Padrão",
    descricao: "A organização clássica do FlyControl. Serve para qualquer negócio.",
    ordem: ["capa", "pizzas", "combos", "cardapio", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "pizza",
    nome: "Pizzaria",
    descricao: "Sabores logo de cara, monte sua pizza em destaque e combos na sequência.",
    ordem: ["capa", "pizzas", "populares", "combos", "cardapio", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "burger",
    nome: "Hamburgueria",
    descricao: "Foto grande, destaques no topo e compra em um toque.",
    ordem: ["capa", "populares", "cardapio", "combos", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "acai",
    nome: "Açaí e sorveteria",
    descricao: "Tamanhos e complementos primeiro — a montagem é o produto.",
    ordem: ["capa", "cardapio", "populares", "combos", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "restaurant",
    nome: "Restaurante",
    descricao: "Categorias organizadas e espaço para descrever bem cada prato.",
    ordem: ["capa", "categorias", "populares", "cardapio", "combos", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "japanese",
    nome: "Japonês e sushi",
    descricao: "Combinados em destaque e a quantidade de peças visível no card.",
    ordem: ["capa", "combos", "categorias", "populares", "cardapio", "bebidas"],
    colunas: 2,
    buscaEmDestaque: false,
  },
  {
    id: "bakery",
    nome: "Padaria e cafeteria",
    descricao: "Compra rápida, com mais itens à vista e busca por perto.",
    ordem: ["capa", "busca", "populares", "categorias", "cardapio", "bebidas"],
    colunas: 3,
    buscaEmDestaque: false,
  },
  {
    id: "beverage",
    nome: "Adega e distribuidora",
    descricao: "Busca em primeiro lugar e prateleira de produtos, como uma loja.",
    ordem: ["capa", "busca", "categorias", "populares", "cardapio", "bebidas", "combos"],
    colunas: 3,
    buscaEmDestaque: true,
  },
  {
    id: "pharmacy",
    nome: "Farmácia",
    descricao: "Catálogo com busca no topo, do jeito que se procura remédio.",
    ordem: ["capa", "busca", "categorias", "cardapio", "populares", "combos", "bebidas"],
    colunas: 3,
    buscaEmDestaque: true,
  },
  {
    id: "market",
    nome: "Mercado e conveniência",
    descricao: "Muitas categorias, muitos itens na tela e carrinho sempre à mão.",
    ordem: ["capa", "busca", "categorias", "cardapio", "populares", "combos", "bebidas"],
    colunas: 4,
    buscaEmDestaque: true,
  },
] as const;

export function layoutPorId(id: unknown): LayoutDeCardapio | null {
  return LAYOUTS.find((l) => l.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Do tipo de estabelecimento para o layout recomendado
// ---------------------------------------------------------------------------

/**
 * Os apelidos são os valores que a tela "Minha Loja" já grava hoje em
 * `business_type`, mais as variações que aparecem em nome de loja. Reconhecer
 * o que já está gravado evita obrigar 100% das lojas a recadastrar o tipo.
 */
const RECOMENDACAO: ReadonlyArray<{ apelidos: readonly string[]; layout: LayoutId }> = [
  { apelidos: ["pizzaria", "pizza", "pizzas"], layout: "pizza" },
  {
    apelidos: ["hamburgueria", "burger", "lanchonete", "lanches", "pastelaria"],
    layout: "burger",
  },
  { apelidos: ["acaiteria", "acai", "sorveteria", "sorvetes", "gelateria"], layout: "acai" },
  { apelidos: ["restaurante", "restaurant", "marmitaria", "self service"], layout: "restaurant" },
  { apelidos: ["japones", "japonesa", "sushi", "temakeria", "oriental"], layout: "japanese" },
  { apelidos: ["padaria", "panificadora", "cafeteria", "cafe", "confeitaria"], layout: "bakery" },
  { apelidos: ["adega", "distribuidora", "bebidas", "choperia", "bar"], layout: "beverage" },
  { apelidos: ["farmacia", "drogaria"], layout: "pharmacy" },
  {
    apelidos: ["mercado", "mercadinho", "supermercado", "conveniencia", "empório", "emporio"],
    layout: "market",
  },
  { apelidos: ["outro", "outros", "generico"], layout: "generic" },
];

function simplificar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * O layout que combina com o tipo de estabelecimento cadastrado.
 *
 * Devolve `null` quando não reconhece o tipo — e aí a tela mostra "Padrão"
 * como recomendação, em vez de chutar um segmento que a loja não é.
 */
export function layoutRecomendadoPara(businessType: unknown): LayoutId | null {
  if (typeof businessType !== "string") return null;
  const alvo = simplificar(businessType);
  if (!alvo) return null;

  const exato = RECOMENDACAO.find((r) => r.apelidos.includes(alvo));
  if (exato) return exato.layout;

  // "Pizzaria do Zé" cai em pizzaria. A palavra mais longa primeiro, senão
  // "bar" casaria dentro de "barbearia".
  const porPedaco = RECOMENDACAO.flatMap((r) => r.apelidos.map((a) => ({ apelido: a, ...r })))
    .sort((a, b) => b.apelido.length - a.apelido.length)
    .find(({ apelido }) => apelido.length >= 4 && alvo.includes(apelido));

  return porPedaco?.layout ?? null;
}

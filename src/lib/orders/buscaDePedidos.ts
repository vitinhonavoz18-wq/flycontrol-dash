/**
 * Regras da tela "Buscar Pedidos" que não dependem da tela em si — ficam aqui
 * para poderem ser testadas sozinhas.
 *
 * Quem decide de verdade o que cada pessoa pode ver é o banco (as regras de
 * acesso por linha das tabelas `orders` e `pizzerias`): o dono só enxerga as
 * próprias lojas, o administrador geral enxerga todas. O que está aqui é a
 * mesma regra repetida do lado da tela, para ela nunca nem PEDIR o que não
 * deveria — como o garçom que já não leva a comanda de outra mesa, mesmo
 * sabendo que a cozinha recusaria.
 */

/** Valor do seletor que significa "todos os estabelecimentos". */
export const TODOS_OS_ESTABELECIMENTOS = "all";

/** Pedidos por página na lista de resultados. */
export const PEDIDOS_POR_PAGINA = 50;

/** Estabelecimentos por "página" no seletor (busca remota). */
export const LOJAS_POR_PAGINA = 30;

export type EscopoDaBusca =
  /** Administrador, todas as lojas: não filtra por loja (o banco limita). */
  | { tipo: "todas" }
  /** Uma loja específica. */
  | { tipo: "uma"; lojaId: string }
  /** Dono: só as lojas dele. */
  | { tipo: "minhas"; lojaIds: string[] }
  /** Dono sem loja nenhuma: não há o que buscar. */
  | { tipo: "nenhuma" };

/**
 * Decide de quais lojas a busca pode trazer pedidos.
 *
 * - Administrador geral: pode escolher uma loja ou "todas".
 * - Dono de loja: o seletor não existe para ele. Mesmo que alguém force um
 *   valor (mexendo no navegador), aqui ele só vale se for uma das lojas dele;
 *   do contrário, continua valendo "as minhas lojas". E, ainda que isso fosse
 *   burlado, o banco devolveria zero pedidos de loja alheia.
 */
export function escopoDaBusca(params: {
  isSuperAdmin: boolean;
  lojaEscolhida: string;
  minhasLojas: string[];
}): EscopoDaBusca {
  const { isSuperAdmin, lojaEscolhida, minhasLojas } = params;
  const escolhida = lojaEscolhida.trim();

  if (isSuperAdmin) {
    if (!escolhida || escolhida === TODOS_OS_ESTABELECIMENTOS) return { tipo: "todas" };
    return { tipo: "uma", lojaId: escolhida };
  }

  if (!minhasLojas.length) return { tipo: "nenhuma" };
  if (escolhida && escolhida !== TODOS_OS_ESTABELECIMENTOS && minhasLojas.includes(escolhida)) {
    return { tipo: "uma", lojaId: escolhida };
  }
  return { tipo: "minhas", lojaIds: minhasLojas };
}

// ---------------------------------------------------------------------------
// Filtro "Tipo do Pedido" feito no banco
//
// Antes, o tipo (delivery / retirada / mesa) era filtrado DEPOIS de os pedidos
// chegarem, com `normalizeOrderType`. Com paginação isso não funciona: a
// contagem e as páginas sairiam erradas (seria como contar as comandas da
// pilha inteira e só depois tirar as de mesa). Então a mesma regra de
// `normalizeOrderType` foi reescrita como filtro do banco.
//
// Cada condição vem "protegida" com `coluna não vazia E ...`. Sem isso, um
// campo em branco faria o banco responder "não sei" em vez de "não", e os
// pedidos de delivery (que são "nem mesa, nem retirada") sumiriam da busca.
// ---------------------------------------------------------------------------

function cond(coluna: string, teste: string) {
  return `and(${coluna}.not.is.null,${coluna}.${teste})`;
}

/** Campo de texto "preenchido" do jeito do JavaScript: ao menos 1 caractere. */
function preenchido(coluna: string) {
  return cond(coluna, "like._*");
}

const COLUNAS_DE_TIPO = ["order_type", "service_mode", "delivery_type"] as const;

const CONDICOES_MESA = [
  ...COLUNAS_DE_TIPO.flatMap((c) => [cond(c, "ilike.table"), cond(c, "ilike.mesa")]),
  preenchido("table_number"),
  cond("customer_address", "ilike.*mesa*"),
].join(",");

const CONDICOES_RETIRADA = [
  ...COLUNAS_DE_TIPO.flatMap((c) => [cond(c, "ilike.pickup"), cond(c, "ilike.retirada")]),
  preenchido("ticket_number"),
  cond("customer_address", "ilike.*retirada*"),
  cond("customer_address", "ilike.*balcão*"),
  cond("customer_address", "ilike.*balcao*"),
].join(",");

/**
 * Expressão para `.or(...)` que reproduz `normalizeOrderType` no banco.
 * Devolve `null` quando o tipo é "todos" (ou desconhecido): não filtra.
 */
export function filtroDeTipoDoPedido(tipo: string): string | null {
  switch (tipo) {
    case "table":
      return CONDICOES_MESA;
    case "pickup":
      // Mesa ganha de retirada em normalizeOrderType, então "retirada" é
      // "não é mesa E é retirada".
      return `and(not.or(${CONDICOES_MESA}),or(${CONDICOES_RETIRADA}))`;
    case "delivery":
      return `and(not.or(${CONDICOES_MESA}),not.or(${CONDICOES_RETIRADA}))`;
    default:
      return null;
  }
}

/** Texto digitado na busca de loja, limpo para ir num filtro `ilike`. */
export function termoDeBuscaDeLoja(texto: string): string {
  // `%` e `_` são curingas no ilike; vírgula e parênteses atrapalham filtros
  // do PostgREST. Nenhum deles é necessário para achar uma loja pelo nome.
  return texto
    .replace(/[%_,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

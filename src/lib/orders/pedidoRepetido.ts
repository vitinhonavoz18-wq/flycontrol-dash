/**
 * O MESMO PEDIDO NÃO ENTRA DUAS VEZES.
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────
 *
 * O site de pedidos manda o pedido para o painel e espera a resposta "recebi".
 * Se a resposta não chega (internet oscilou, o servidor demorou), o site
 * tenta de novo — até três vezes. Isso é certo: é melhor insistir do que
 * perder o pedido.
 *
 * Só que às vezes o painel JÁ TINHA gravado o pedido, e o que se perdeu foi
 * só o "recebi". O reenvio chegava e o painel gravava tudo de novo: duas
 * comandas na cozinha, duas pizzas no forno, e dois pedidos na conta de quem
 * paga por pedido.
 *
 * É o garçom que anotou o pedido, mas o cliente não ouviu o "anotado" e
 * repetiu — e saíram dois pratos.
 *
 * ── A SOLUÇÃO ─────────────────────────────────────────────────────────────
 *
 * Cada pedido já sai do site com um número de série único (o site gera um
 * código novo a cada pedido). O painel passou a olhar esse número: se já
 * existe um pedido da mesma loja com ele, responde "já recebi, é o pedido
 * nº tal" e não grava nada de novo.
 *
 * Para o site, a resposta é igual à de um pedido recém-gravado — ele para de
 * insistir e mostra a tela de sucesso para o cliente.
 *
 * ── O QUE NÃO É REPETIÇÃO ─────────────────────────────────────────────────
 *
 * O cliente que pede a mesma coisa duas vezes de propósito gera DOIS números
 * de série diferentes — são dois pedidos, e os dois entram. A trava olha o
 * número de série, nunca o conteúdo.
 *
 * Pedido que chega SEM número de série (integração antiga) continua entrando
 * como sempre: sem número não há como saber se é repetido, e recusar seria
 * pior do que duplicar.
 */

/** Tamanho máximo aceito para o número de série. Acima disso é lixo ou ataque. */
const TAMANHO_MAXIMO = 200;

function limpar(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const texto = String(valor).trim();
  if (!texto || texto.length > TAMANHO_MAXIMO) return null;
  return texto;
}

/**
 * Descobre o número de série do pedido, na mesma ordem em que o painel já o
 * gravava: primeiro o que vem dentro do pedido, depois o do envelope, e por
 * último o cabeçalho que o site manda justamente para isso.
 *
 * Devolve `null` quando não veio nenhum.
 */
export function chaveDoPedidoExterno(origem: {
  /** `order.id` do corpo. */
  idDoPedido?: unknown;
  /** `order_id` solto no corpo. */
  orderIdDoCorpo?: unknown;
  /** `id` solto no corpo. */
  idDoCorpo?: unknown;
  /** Cabeçalho `x-idempotency-key`. */
  cabecalho?: unknown;
}): string | null {
  return (
    limpar(origem.idDoPedido) ??
    limpar(origem.orderIdDoCorpo) ??
    limpar(origem.idDoCorpo) ??
    limpar(origem.cabecalho)
  );
}

/** O pedido que já estava gravado, como o banco devolve. */
export type PedidoJaGravado = {
  id: string;
  order_number: number | string | null;
  delivery_type?: string | null;
  order_type?: string | null;
  table_number?: string | null;
};

/**
 * A resposta para o reenvio: os mesmos campos de um pedido recém-gravado,
 * para o site não precisar saber a diferença, mais `duplicate: true` para
 * quem lê o registro saber o que aconteceu.
 */
export function respostaDePedidoRepetido(pedido: PedidoJaGravado) {
  const tipo = pedido.delivery_type || pedido.order_type || null;
  return {
    success: true as const,
    duplicate: true as const,
    order_id: pedido.id,
    order_number: pedido.order_number,
    order_type: tipo,
    service_mode: tipo === "table" ? "mesa" : tipo,
    table_number: pedido.table_number ?? null,
    message: "Pedido já recebido",
  };
}

/** Nome da trava no banco (ver a migração `pedido_externo_unico`). */
export const INDICE_DE_PEDIDO_UNICO = "orders_pedido_externo_unico";

/**
 * O banco recusou a gravação porque o número de série já existe?
 *
 * Acontece quando dois reenvios chegam no MESMO instante: os dois consultam,
 * nenhum acha, os dois tentam gravar — e a trava do banco deixa passar só um.
 * O outro cai aqui e deve responder "já recebi", não "deu erro".
 */
export function ehRecusaPorPedidoRepetido(
  erro: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!erro) return false;
  return erro.code === "23505" && String(erro.message ?? "").includes(INDICE_DE_PEDIDO_UNICO);
}

/**
 * AS DEFINIÇÕES DOS NÚMEROS DA TELA "RELATÓRIOS E FINANÇAS".
 *
 * Número de dinheiro precisa de definição escrita. Sem ela, "faturamento" vira
 * o que cada tela resolver somar — e o dono descobre no fim do mês que o
 * caixa não bate com o relatório.
 *
 * ── PEDIDO CANCELADO NÃO É VENDA ──────────────────────────────────────────
 *
 * Até aqui a tela somava TODO pedido do período, inclusive o cancelado. Um
 * pedido de R$ 120 que o cliente desistiu entrava no faturamento, no ticket
 * médio, no gráfico e no ranking de produtos.
 *
 * É contar como vendida a pizza que voltou para a cozinha.
 *
 * Agora:
 *
 *   • FATURAMENTO, TOTAL DE PEDIDOS, TICKET MÉDIO, gráficos e rankings
 *     consideram só pedido NÃO cancelado;
 *   • os cancelados aparecem à parte (quantos e quanto valiam), para o dono
 *     enxergar o que deixou de entrar;
 *   • a LISTA de pedidos do período continua mostrando todos, cancelados
 *     inclusive — é a lista de conferência, não a conta.
 *
 * Exceção de bom senso: se a pessoa filtra a tela por "Cancelado", ela quer
 * ver os cancelados — aí os números mostram exatamente eles.
 *
 * ── O "DIA" É O DIA DO APARELHO ───────────────────────────────────────────
 *
 * "Hoje" vai da meia-noite às 23:59 no relógio do aparelho que abriu a tela,
 * que na prática é o relógio da loja. O banco guarda o horário em formato
 * universal; a conversão é feita aqui na tela.
 */

/** Como o status de cancelamento é gravado no pedido. */
export const STATUS_CANCELADO = "cancelado";

/** O pedido entra na conta do faturamento? */
export function pedidoContaComoVenda(status: string | null | undefined): boolean {
  return status !== STATUS_CANCELADO;
}

/**
 * Separa os pedidos do período em "contam como venda" e "cancelados".
 *
 * `filtroDeStatus` é o filtro que a pessoa escolheu na tela. Se ela escolheu
 * ver os cancelados, eles são o assunto: vão para `validos` e a lista de
 * cancelados à parte fica vazia (não faz sentido avisar "ficaram de fora" o
 * que está sendo mostrado).
 */
export function separarCancelados<T extends { status: string }>(
  pedidos: readonly T[],
  filtroDeStatus: string = "all",
): { validos: T[]; cancelados: T[] } {
  if (filtroDeStatus === STATUS_CANCELADO) {
    return { validos: [...pedidos], cancelados: [] };
  }
  const validos: T[] = [];
  const cancelados: T[] = [];
  for (const pedido of pedidos) {
    (pedidoContaComoVenda(pedido.status) ? validos : cancelados).push(pedido);
  }
  return { validos, cancelados };
}

/** Quantos pedidos foram cancelados e quanto eles valiam. */
export function resumoDosCancelados(cancelados: readonly { total: number }[]): {
  quantidade: number;
  valor: number;
} {
  return {
    quantidade: cancelados.length,
    valor: cancelados.reduce((soma, pedido) => soma + (Number(pedido.total) || 0), 0),
  };
}

// ── Período personalizado ──────────────────────────────────────────────────

/** Até quantos dias para trás a tela carrega pedidos. */
export const DIAS_DE_HISTORICO = 90;

/** Data no formato do campo de data do navegador: "2026-11-11". */
export function paraCampoDeData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Lê "2026-11-11" como meia-noite daquele dia NO RELÓGIO DO APARELHO.
 *
 * `new Date("2026-11-11")` leria como meia-noite em Londres — no Brasil isso
 * é 21h do dia ANTERIOR, e o filtro "dia 11" mostraria pedidos do dia 10. É
 * o tipo de erro que só aparece no fechamento do caixa.
 */
export function lerCampoDeData(texto: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return null;
  const [, ano, mes, dia] = partes.map(Number);
  const data = new Date(ano, mes - 1, dia);
  // "2026-02-31" não existe: o navegador empurraria para março. Recusa.
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return data;
}

/**
 * Monta o intervalo do "período personalizado".
 *
 * Tolerante de propósito: se as datas vierem trocadas (fim antes do início),
 * destroca; se passarem de hoje ou forem mais antigas que o histórico
 * carregado, encosta no limite. O lojista nunca cai numa tela vazia por ter
 * clicado na ordem errada.
 *
 * Devolve `null` só quando uma das datas não é uma data.
 */
export function intervaloPersonalizado(
  de: string,
  ate: string,
  hoje: Date = new Date(),
): { start: Date; end: Date } | null {
  const a = lerCampoDeData(de);
  const b = lerCampoDeData(ate);
  if (!a || !b) return null;

  const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const maisAntigo = new Date(inicioDeHoje);
  maisAntigo.setDate(maisAntigo.getDate() - DIAS_DE_HISTORICO);

  const limitar = (d: Date) =>
    d.getTime() > inicioDeHoje.getTime()
      ? inicioDeHoje
      : d.getTime() < maisAntigo.getTime()
        ? maisAntigo
        : d;

  let inicio = limitar(a);
  let fim = limitar(b);
  if (inicio.getTime() > fim.getTime()) [inicio, fim] = [fim, inicio];

  const fimDoDia = new Date(fim);
  fimDoDia.setHours(23, 59, 59, 999);
  return { start: inicio, end: fimDoDia };
}

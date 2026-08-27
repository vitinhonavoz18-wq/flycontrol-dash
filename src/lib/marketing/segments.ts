/**
 * Segmentação: quem entra na campanha.
 *
 * A ideia é separar em dois o que normalmente vem grudado:
 *
 * 1. O que o dono escolheu na tela (`FiltroSegmento`) — "clientes que não
 *    compram há 30 dias". É isso que fica guardado na campanha, e é isso que
 *    responde depois à pergunta "por que essa pessoa recebeu?".
 *
 * 2. O que o banco entende (`FiltroResolvido`) — uma data de corte, um
 *    mínimo de pedidos, um mínimo de centavos.
 *
 * Separar permite acrescentar um filtro novo amanhã sem mexer em quem monta a
 * consulta, e permite que a mesma escolha seja usada em três lugares: no
 * contador de público, na criação dos destinatários e no histórico.
 *
 * REGRA QUE NÃO SE NEGOCIA
 *
 * `requireOptIn` é sempre verdadeiro e não é parâmetro. Não existe caminho —
 * nem filtro, nem tipo de campanha, nem chamada de API — que monte um público
 * incluindo quem não aceitou receber. É como a porta do estoque: não existe
 * "modo sem chave", a chave é a única forma de entrar.
 */

export type FiltroSegmento =
  | { tipo: "todos" }
  | { tipo: "inativos"; dias: number }
  | { tipo: "ativos"; dias: number }
  | { tipo: "quantidade_pedidos"; min?: number; max?: number }
  | { tipo: "valor_gasto"; minReais?: number; maxReais?: number }
  | { tipo: "ticket_medio"; minReais?: number; maxReais?: number }
  | { tipo: "cadastro"; desdeIso?: string; ateIso?: string }
  | { tipo: "tags"; tags: string[] }
  | { tipo: "manual"; customerIds: string[] };

/** O que o banco entende. Tudo opcional menos o consentimento. */
export type FiltroResolvido = {
  /** Sempre true. Existe como campo só para ficar explícito na leitura. */
  requireOptIn: true;
  lastOrderBefore?: string;
  lastOrderAfter?: string;
  minOrders?: number;
  maxOrders?: number;
  minSpentCents?: number;
  maxSpentCents?: number;
  minTicketCents?: number;
  maxTicketCents?: number;
  createdAfter?: string;
  createdBefore?: string;
  tags?: string[];
  customerIds?: string[];
};

const DIA_MS = 86_400_000;

function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString();
}

function reaisParaCentavos(v: number | undefined): number | undefined {
  if (v === undefined || v === null || Number.isNaN(v)) return undefined;
  return Math.round(v * 100);
}

export function construirFiltro(f: FiltroSegmento): FiltroResolvido {
  const base: FiltroResolvido = { requireOptIn: true };

  switch (f.tipo) {
    case "todos":
      return base;

    case "inativos":
      // "Não compra há 30 dias" = a última compra dele é anterior a 30 dias
      // atrás. Quem nunca comprou não entra aqui — não dá para dizer que
      // sumiu quem nunca apareceu.
      return { ...base, lastOrderBefore: diasAtras(f.dias) };

    case "ativos":
      return { ...base, lastOrderAfter: diasAtras(f.dias) };

    case "quantidade_pedidos":
      return { ...base, minOrders: f.min, maxOrders: f.max };

    case "valor_gasto":
      return {
        ...base,
        minSpentCents: reaisParaCentavos(f.minReais),
        maxSpentCents: reaisParaCentavos(f.maxReais),
      };

    case "ticket_medio":
      return {
        ...base,
        minTicketCents: reaisParaCentavos(f.minReais),
        maxTicketCents: reaisParaCentavos(f.maxReais),
      };

    case "cadastro":
      return { ...base, createdAfter: f.desdeIso, createdBefore: f.ateIso };

    case "tags":
      return { ...base, tags: f.tags.filter((t) => t.trim() !== "") };

    case "manual":
      return { ...base, customerIds: f.customerIds };
  }
}

/**
 * Aplica o filtro a uma consulta do Supabase.
 *
 * Recebe a consulta já começada (para servir tanto ao contador quanto à
 * listagem quanto à criação dos destinatários) e devolve com os filtros
 * empilhados. O `tenant_id` NÃO entra aqui de propósito: quem chama é que
 * amarra a loja, a partir da sessão de quem está logado — nunca do que o
 * navegador mandou.
 */
export function aplicarFiltro<T>(query: T, f: FiltroResolvido): T {
  let q = query as any;

  // O consentimento vem primeiro, e não depende do filtro escolhido.
  q = q.eq("marketing_opt_in", true).eq("status", "active").eq("is_mobile", true);

  if (f.lastOrderBefore) q = q.lt("last_order_at", f.lastOrderBefore);
  if (f.lastOrderAfter) q = q.gte("last_order_at", f.lastOrderAfter);
  if (f.minOrders !== undefined) q = q.gte("orders_count", f.minOrders);
  if (f.maxOrders !== undefined) q = q.lte("orders_count", f.maxOrders);
  if (f.minSpentCents !== undefined) q = q.gte("total_spent_cents", f.minSpentCents);
  if (f.maxSpentCents !== undefined) q = q.lte("total_spent_cents", f.maxSpentCents);
  if (f.createdAfter) q = q.gte("created_at", f.createdAfter);
  if (f.createdBefore) q = q.lte("created_at", f.createdBefore);
  if (f.tags?.length) q = q.overlaps("tags", f.tags);
  if (f.customerIds?.length) q = q.in("id", f.customerIds);

  // Ticket médio não é coluna: é total gasto dividido por número de pedidos.
  // Filtrar por ele no banco exigiria uma expressão que o índice não cobre e
  // deixaria a tela lenta com base grande. Fica para uma coluna calculada
  // quando alguém realmente pedir — e por isso não é oferecido na tela ainda.

  return q as T;
}

/** Como explicar o público para o dono, em português. */
export function descreverSegmento(f: FiltroSegmento): string {
  switch (f.tipo) {
    case "todos":
      return "Todos os clientes que aceitaram receber ofertas";
    case "inativos":
      return `Clientes que não compram há ${f.dias} dias`;
    case "ativos":
      return `Clientes que compraram nos últimos ${f.dias} dias`;
    case "quantidade_pedidos":
      if (f.min !== undefined && f.max !== undefined)
        return `Clientes com ${f.min} a ${f.max} pedidos`;
      if (f.min !== undefined) return `Clientes com mais de ${f.min} pedidos`;
      if (f.max !== undefined) return `Clientes com até ${f.max} pedidos`;
      return "Clientes por quantidade de pedidos";
    case "valor_gasto":
      if (f.minReais !== undefined && f.maxReais !== undefined)
        return `Clientes que gastaram de R$ ${f.minReais} a R$ ${f.maxReais}`;
      if (f.minReais !== undefined) return `Clientes que já gastaram mais de R$ ${f.minReais}`;
      return "Clientes por valor gasto";
    case "ticket_medio":
      return "Clientes por ticket médio";
    case "cadastro":
      return "Clientes por data de cadastro";
    case "tags":
      return `Clientes marcados como ${f.tags.join(", ")}`;
    case "manual":
      return `${f.customerIds.length} cliente(s) escolhido(s) na mão`;
  }
}

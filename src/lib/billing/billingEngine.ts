/**
 * Motor de cobrança da FlyControl.
 *
 * Funções puras: recebem o estado do ciclo e devolvem o cálculo. Nada de
 * React, nada de rede, nada de data implícita — o que entra determina o que
 * sai, e por isso dá para testar cada regra comercial isoladamente.
 *
 * O frontend pode usar estas funções para MOSTRAR estimativas. O valor
 * oficial de uma fatura é sempre calculado no servidor, sobre dados lidos do
 * banco — nunca sobre números enviados pelo navegador.
 */

import { assertCents, multiplyCents, sumCents, type Cents } from "./money";
import { POLITICA_CENTS_V2, custoTotalCents, distribuirPorFaixa } from "./centsTiers";
import { getPlanPricing, type BillingModel, type PlanCode } from "./plans";

// ---------------------------------------------------------------------------
// Pedido faturável
// ---------------------------------------------------------------------------

/**
 * Status em que o pedido já entrou no fluxo operacional real.
 *
 * `novo` fica de fora de propósito: um pedido recém-chegado ainda pode ser
 * recusado, e cobrar por ele seria cobrar por algo que não virou operação.
 * A contagem começa quando o estabelecimento aceita — que no FlyControl é a
 * transição para `preparando`.
 *
 * Os valores em inglês e as variantes legadas existem porque pedidos entram
 * por integrações externas que não seguem o vocabulário interno.
 */
export const BILLABLE_STATUSES: ReadonlySet<string> = new Set([
  "preparando",
  "saiu",
  "saiu_entrega",
  "pronto",
  "entregue",
  "concluido",
  "ready",
  "delivered",
  "completed",
]);

/** Status que nunca geram cobrança, mesmo que já tenham sido faturáveis antes. */
const NON_BILLABLE_STATUSES = new Set([
  "novo",
  "pendente",
  "cancelado",
  "cancelled",
  "canceled",
  "deleted",
  "recusado",
  "rejected",
]);

export type BillableOrderInput = {
  status: string | null | undefined;
  /** Marcação explícita de pedido de teste/demonstração. */
  is_test?: boolean | null;
  /** Escape hatch auditável para excluir um pedido específico da cobrança. */
  is_billable_override?: boolean | null;
  total?: number | string | null;
  items?: unknown;
  customer_name?: string | null;
};

/**
 * Decide se um pedido conta para a cobrança por uso.
 *
 * Ponto único da regra: se um dia a definição comercial mudar, muda aqui e em
 * nenhum outro lugar.
 */
export function isBillableOrder(order: BillableOrderInput): boolean {
  // A marcação explícita vence qualquer heurística, nos dois sentidos.
  if (order.is_billable_override === false) return false;
  if (order.is_test === true) return false;

  const status = String(order.status ?? "")
    .trim()
    .toLowerCase();
  if (!status) return false;
  if (NON_BILLABLE_STATUSES.has(status)) return false;
  if (!BILLABLE_STATUSES.has(status)) return false;

  // Pedidos-fantasma: o site cria um registro vazio ao abrir uma sessão de
  // mesa. Total zero, sem itens e sem cliente identificado não é operação.
  const total = Number(order.total ?? 0);
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const hasCustomer = !!order.customer_name && order.customer_name !== "Cliente Site";
  if (total === 0 && itemCount === 0 && !hasCustomer) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Preço vigente do ciclo
// ---------------------------------------------------------------------------

export type CycleInput = {
  planCode: PlanCode;
  /**
   * Preço unitário CONGELADO na abertura do ciclo. Nunca é recalculado
   * durante o ciclo: é isso que impede alteração retroativa.
   */
  unitPriceCents: Cents;
  promotionThresholdOrders: number;
  /** Pedidos faturáveis contados por eventos de uso, não por um contador solto. */
  billableOrderCount: number;
  /**
   * `true` quando a taxa de cadastro JÁ foi faturada em algum ciclo anterior.
   * Deriva de item de fatura existente, e não do número do ciclo — um ciclo
   * pode ser reprocessado, mas a taxa continua sendo uma só.
   */
  setupFeeAlreadyCharged: boolean;
  /**
   * Qual política de preço do CENTS este ciclo contratou.
   *
   * Ausente = a política antiga (um preço só, o congelado em
   * `unitPriceCents`). É o que mantém intacta a conta de todo ciclo que já
   * estava aberto antes das faixas existirem: mudar a regra no meio do mês
   * seria mudar o preço depois de o cliente já ter vendido.
   */
  centsPolicy?: string;
};

export type CycleTotals = {
  billingModel: BillingModel;
  unitPriceCents: Cents;
  billableOrderCount: number;
  /** Consumo: pedidos × preço unitário. Zero em plano mensal fixo. */
  usageAmountCents: Cents;
  setupFeeAmountCents: Cents;
  monthlyFeeAmountCents: Cents;
  discountAmountCents: Cents;
  totalAmountCents: Cents;
  /** A política de faixas usada, quando houve. Vira o detalhe da fatura. */
  centsPolicy?: string;
  /** Se o ciclo atingiu a meta e libera o preço promocional para o PRÓXIMO. */
  qualifiedForNextCycle: boolean;
};

/**
 * Calcula os totais de um ciclo.
 *
 * O preço unitário usado é o do ciclo, congelado na abertura. Atingir a meta
 * durante o ciclo NÃO barateia o próprio ciclo — só o seguinte.
 */
export function calculateCycle(input: CycleInput): CycleTotals {
  const pricing = getPlanPricing(input.planCode);
  const unitPriceCents = assertCents(input.unitPriceCents, "unitPriceCents");

  if (!Number.isSafeInteger(input.billableOrderCount) || input.billableOrderCount < 0) {
    throw new Error(`[billing] billableOrderCount inválido: ${String(input.billableOrderCount)}`);
  }

  const isUsageBased = pricing.billingModel === "usage_per_order";

  // Em plano mensal fixo os pedidos são métrica, não faturamento.
  //
  // No CENTS com faixas, a conta é progressiva: os primeiros pedidos custam
  // mais caro e os seguintes vão barateando, como conta de luz. O desconto
  // conquistado vale DALI PARA FRENTE — quem faz 600 pedidos não paga R$ 0,40
  // nos 600.
  const politicaDeFaixas =
    isUsageBased && input.centsPolicy === POLITICA_CENTS_V2.versao ? POLITICA_CENTS_V2 : null;

  const usageAmountCents = !isUsageBased
    ? 0
    : politicaDeFaixas
      ? custoTotalCents(politicaDeFaixas, input.billableOrderCount)
      : multiplyCents(unitPriceCents, input.billableOrderCount);

  const setupFeeAmountCents =
    !input.setupFeeAlreadyCharged && pricing.setupFeeCents > 0 ? pricing.setupFeeCents : 0;

  const monthlyFeeAmountCents = pricing.monthlyFeeCents;

  const discountAmountCents = 0; // Sem regra de desconto definida comercialmente.

  const totalAmountCents = sumCents(
    usageAmountCents,
    setupFeeAmountCents,
    monthlyFeeAmountCents,
    -discountAmountCents,
  );

  return {
    billingModel: pricing.billingModel,
    unitPriceCents,
    billableOrderCount: input.billableOrderCount,
    centsPolicy: politicaDeFaixas?.versao,
    usageAmountCents,
    setupFeeAmountCents,
    monthlyFeeAmountCents,
    discountAmountCents,
    totalAmountCents,
    qualifiedForNextCycle: qualifiesForPromotion(input),
  };
}

/**
 * A meta foi atingida?
 *
 * Só planos por uso com meta configurada podem qualificar. O PREMIUM nunca
 * qualifica porque não tem promoção por volume.
 */
export function qualifiesForPromotion(input: {
  planCode: PlanCode;
  promotionThresholdOrders: number;
  billableOrderCount: number;
}): boolean {
  const pricing = getPlanPricing(input.planCode);
  if (pricing.billingModel !== "usage_per_order") return false;
  if (input.promotionThresholdOrders <= 0) return false;
  return input.billableOrderCount >= input.promotionThresholdOrders;
}

/**
 * Preço unitário do PRÓXIMO ciclo.
 *
 * Regra comercial completa:
 * - Atingiu a meta neste ciclo  → próximo ciclo a R$ 0,45.
 * - Não atingiu                 → próximo ciclo a R$ 0,70, mesmo que este
 *                                 ciclo esteja no preço promocional.
 *
 * A qualificação vale por ciclo: manter R$ 0,45 exige bater a meta sempre.
 */
export function determineNextCycleUnitPrice(input: {
  planCode: PlanCode;
  qualifiedForNextCycle: boolean;
}): Cents {
  const pricing = getPlanPricing(input.planCode);
  if (pricing.billingModel !== "usage_per_order") return 0;
  return input.qualifiedForNextCycle
    ? pricing.promotionalOrderUnitPriceCents
    : pricing.defaultOrderUnitPriceCents;
}

/** Preço unitário do primeiro ciclo de uma assinatura nova. */
export function initialUnitPriceCents(planCode: PlanCode): Cents {
  return getPlanPricing(planCode).defaultOrderUnitPriceCents;
}

// ---------------------------------------------------------------------------
// Itens da fatura
// ---------------------------------------------------------------------------

export type InvoiceItemDraft = {
  itemType: "monthly_fee" | "setup_fee" | "usage" | "discount";
  description: string;
  quantity: number;
  unitAmountCents: Cents;
  totalAmountCents: Cents;
};

/**
 * Traduz os totais de um ciclo em linhas de fatura.
 *
 * Item de valor zero não é emitido: uma fatura CENTS não deve exibir
 * "Mensalidade R$ 0,00", nem uma fatura PREMIUM exibir consumo.
 */
export function buildInvoiceItems(planCode: PlanCode, totals: CycleTotals): InvoiceItemDraft[] {
  const pricing = getPlanPricing(planCode);
  const items: InvoiceItemDraft[] = [];

  if (totals.monthlyFeeAmountCents > 0) {
    items.push({
      itemType: "monthly_fee",
      description: `Mensalidade do plano ${pricing.name}`,
      quantity: 1,
      unitAmountCents: totals.monthlyFeeAmountCents,
      totalAmountCents: totals.monthlyFeeAmountCents,
    });
  }

  if (totals.setupFeeAmountCents > 0) {
    items.push({
      itemType: "setup_fee",
      description: `Taxa única de cadastro do plano ${pricing.name}`,
      quantity: 1,
      unitAmountCents: totals.setupFeeAmountCents,
      totalAmountCents: totals.setupFeeAmountCents,
    });
  }

  if (totals.billingModel === "usage_per_order" && totals.billableOrderCount > 0) {
    // Com faixas, a fatura sai discriminada: uma linha por faixa usada. Uma
    // linha só, com um preço médio, faria o cliente conferir a conta e não
    // conseguir refazê-la — é o tipo de fatura que gera ligação para o
    // suporte.
    if (totals.centsPolicy === POLITICA_CENTS_V2.versao) {
      for (const pedaco of distribuirPorFaixa(POLITICA_CENTS_V2, totals.billableOrderCount)) {
        const ate = pedaco.faixa.ate === null ? "+" : `–${pedaco.faixa.ate}`;
        items.push({
          itemType: "usage",
          description: `Pedidos ${pedaco.faixa.de}${ate} (${pedaco.faixa.rotulo})`,
          quantity: pedaco.quantidade,
          unitAmountCents: pedaco.faixa.precoCents,
          totalAmountCents: pedaco.subtotalCents,
        });
      }
    } else {
      items.push({
        itemType: "usage",
        description: "Pedidos válidos no ciclo",
        quantity: totals.billableOrderCount,
        unitAmountCents: totals.unitPriceCents,
        totalAmountCents: totals.usageAmountCents,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

/**
 * Chave que identifica unicamente "este pedido, contado neste ciclo".
 *
 * Vai para uma restrição UNIQUE no banco: reprocessar a mesma entrada é um
 * conflito silencioso em vez de uma cobrança duplicada. A proteção real está
 * no banco — esta função só monta a chave.
 */
export function usageIdempotencyKey(billingCycleId: string, orderId: string): string {
  return `order_billable:${billingCycleId}:${orderId}`;
}

// ---------------------------------------------------------------------------
// Ciclo mensal
// ---------------------------------------------------------------------------

/**
 * Início do próximo ciclo: mesmo dia do mês seguinte, ancorado na data de
 * ativação e não no mês civil.
 *
 * Quando o dia âncora não existe no mês seguinte (29, 30 ou 31 caindo em
 * fevereiro), o próximo ciclo começa no primeiro dia do mês subsequente. A
 * alternativa — encurtar para o último dia do mês — deixaria esse último dia
 * sem pertencer a ciclo nenhum, e um pedido feito nele não seria cobrado.
 */
export function computeNextCycleStart(cycleStart: Date): Date {
  const year = cycleStart.getUTCFullYear();
  const month = cycleStart.getUTCMonth();
  const day = cycleStart.getUTCDate();

  const daysInNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();

  return day > daysInNextMonth
    ? new Date(Date.UTC(year, month + 2, 1))
    : new Date(Date.UTC(year, month + 1, day));
}

/**
 * Fim do ciclo: o último instante antes do próximo começar.
 *
 * Derivar o fim do início do próximo garante que os ciclos sejam contíguos e
 * sem sobreposição — nenhum instante fica de fora nem é contado duas vezes.
 */
export function computeCycleEnd(cycleStart: Date): Date {
  return new Date(computeNextCycleStart(cycleStart).getTime() - 1);
}

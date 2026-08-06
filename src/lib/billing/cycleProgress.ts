/**
 * Progresso do ciclo para a tela do cliente.
 *
 * Funções puras. O que aparece aqui é ESTIMATIVA: o valor oficial é o que o
 * servidor calcula no fechamento, sobre os eventos de uso. A tela precisa
 * dizer isso ao usuário — número que muda depois sem aviso destrói confiança.
 */

import { multiplyCents, type Cents } from "./money";
import { getPlanPricing, type PlanCode } from "./plans";

export type CycleProgressInput = {
  planCode: PlanCode;
  /** Preço congelado na abertura do ciclo. */
  unitPriceCents: Cents;
  promotionThresholdOrders: number;
  billableOrderCount: number;
  /** Este ciclo já entrou com o preço promocional herdado do anterior. */
  qualifiedFromPreviousCycle: boolean;
  /** Taxa de cadastro já faturada em ciclo anterior. */
  setupFeeAlreadyCharged: boolean;
  cycleEnd: Date;
  now: Date;
};

export type PromotionState =
  "below_target" | "target_reached" | "keeping_promotion" | "losing_promotion";

export type CycleProgress = {
  billableOrderCount: number;
  thresholdOrders: number;
  /** 0 a 100, saturado no topo — 120% de meta não é barra de 120%. */
  percent: number;
  ordersRemaining: number;
  unitPriceCents: Cents;
  nextCycleUnitPriceCents: Cents;
  /** Consumo acumulado + taxa de cadastro, se ainda não faturada. */
  estimatedTotalCents: Cents;
  setupFeeCents: Cents;
  daysRemaining: number;
  state: PromotionState;
  message: string;
};

/**
 * Em que ponto da promoção o cliente está.
 *
 * Quatro situações distintas, e cada uma pede uma frase diferente: quem está
 * prestes a ganhar o desconto precisa saber quanto falta; quem está prestes a
 * perdê-lo precisa saber que vai perder.
 */
export function getPromotionState(input: {
  billableOrderCount: number;
  promotionThresholdOrders: number;
  qualifiedFromPreviousCycle: boolean;
}): PromotionState {
  const reached =
    input.promotionThresholdOrders > 0 &&
    input.billableOrderCount >= input.promotionThresholdOrders;

  if (input.qualifiedFromPreviousCycle) {
    return reached ? "keeping_promotion" : "losing_promotion";
  }
  return reached ? "target_reached" : "below_target";
}

function buildMessage(
  state: PromotionState,
  args: {
    ordersRemaining: number;
    thresholdOrders: number;
    promotionalPriceLabel: string;
    defaultPriceLabel: string;
  },
): string {
  switch (state) {
    case "below_target":
      return `Faltam ${args.ordersRemaining} ${args.ordersRemaining === 1 ? "pedido" : "pedidos"} para liberar o valor de ${args.promotionalPriceLabel} por pedido no próximo ciclo.`;
    case "target_reached":
      return `Meta atingida! No próximo ciclo, cada pedido será cobrado por ${args.promotionalPriceLabel}.`;
    case "keeping_promotion":
      return `Meta atingida! Você continuará pagando ${args.promotionalPriceLabel} por pedido no próximo ciclo.`;
    case "losing_promotion":
      // Explicitar o que acontece se não atingir é o ponto: o cliente precisa
      // saber que o preço sobe, não descobrir na fatura seguinte.
      return `Você está pagando ${args.promotionalPriceLabel} por pedido neste ciclo. Atinja ${args.thresholdOrders} pedidos para manter esse valor — abaixo disso, o próximo ciclo volta para ${args.defaultPriceLabel}.`;
  }
}

/** Dias inteiros restantes até o fim do ciclo. Nunca negativo. */
export function daysUntil(end: Date, now: Date): number {
  const diff = end.getTime() - now.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}

export function calculateCycleProgress(
  input: CycleProgressInput,
  formatMoney: (cents: Cents) => string,
): CycleProgress {
  const pricing = getPlanPricing(input.planCode);
  const threshold = input.promotionThresholdOrders;
  const count = Math.max(0, input.billableOrderCount);

  const percent = threshold > 0 ? Math.min(100, (count / threshold) * 100) : 0;
  const ordersRemaining = Math.max(0, threshold - count);

  const state = getPromotionState({
    billableOrderCount: count,
    promotionThresholdOrders: threshold,
    qualifiedFromPreviousCycle: input.qualifiedFromPreviousCycle,
  });

  const reached = state === "target_reached" || state === "keeping_promotion";
  const nextCycleUnitPriceCents = reached
    ? pricing.promotionalOrderUnitPriceCents
    : pricing.defaultOrderUnitPriceCents;

  // A taxa de cadastro entra na estimativa só enquanto não tiver sido
  // faturada. Mantê-la depois inflaria o valor de todo mês.
  const setupFeeCents = input.setupFeeAlreadyCharged ? 0 : pricing.setupFeeCents;
  const usageCents = multiplyCents(input.unitPriceCents, count);

  return {
    billableOrderCount: count,
    thresholdOrders: threshold,
    percent,
    ordersRemaining,
    unitPriceCents: input.unitPriceCents,
    nextCycleUnitPriceCents,
    estimatedTotalCents: usageCents + setupFeeCents + pricing.monthlyFeeCents,
    setupFeeCents,
    daysRemaining: daysUntil(input.cycleEnd, input.now),
    state,
    message: buildMessage(state, {
      ordersRemaining,
      thresholdOrders: threshold,
      promotionalPriceLabel: formatMoney(pricing.promotionalOrderUnitPriceCents),
      defaultPriceLabel: formatMoney(pricing.defaultOrderUnitPriceCents),
    }),
  };
}

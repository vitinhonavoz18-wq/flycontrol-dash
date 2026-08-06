/**
 * Definição comercial dos planos.
 *
 * Estes valores são a semente da tabela `plans`/`plan_price_versions` — a
 * fonte de verdade em produção é o banco, porque um preço precisa ter
 * histórico e versão. O que está aqui serve para: semear a primeira versão na
 * migration, alimentar a página pública de planos, e dar aos testes um
 * conjunto de valores conhecidos.
 *
 * Alterar um preço aqui NÃO altera cobranças passadas: cada assinatura aponta
 * para a versão de preço que contratou.
 */

import type { Cents } from "./money";

export type PlanCode = "premium" | "cents";

/** Como o plano cobra. Determina qual caminho do motor de cobrança roda. */
export type BillingModel = "monthly_fixed" | "usage_per_order";

export type PlanPricing = {
  readonly code: PlanCode;
  readonly name: string;
  readonly description: string;
  readonly billingModel: BillingModel;
  /** Cobrada uma única vez, na primeira fatura. */
  readonly setupFeeCents: Cents;
  /** Mensalidade fixa. Zero em planos por uso. */
  readonly monthlyFeeCents: Cents;
  /** Preço por pedido faturável fora da promoção. Zero em planos fixos. */
  readonly defaultOrderUnitPriceCents: Cents;
  /** Preço por pedido depois de qualificar na meta. */
  readonly promotionalOrderUnitPriceCents: Cents;
  /** Pedidos faturáveis necessários no ciclo para qualificar. Zero = sem promoção. */
  readonly promotionThresholdOrders: number;
};

export const PLAN_PRICING: Readonly<Record<PlanCode, PlanPricing>> = {
  premium: {
    code: "premium",
    name: "PREMIUM",
    description:
      "Gestão completa para operações que precisam de mais controle, equipe e recursos avançados.",
    billingModel: "monthly_fixed",
    setupFeeCents: 0,
    monthlyFeeCents: 37_500, // R$ 375,00
    defaultOrderUnitPriceCents: 0,
    promotionalOrderUnitPriceCents: 0,
    promotionThresholdOrders: 0,
  },
  cents: {
    code: "cents",
    name: "CENTS",
    description:
      "Pague de acordo com o volume de pedidos e reduza o valor por pedido ao atingir a meta mensal.",
    billingModel: "usage_per_order",
    setupFeeCents: 2_500, // R$ 25,00, cobrada uma única vez
    monthlyFeeCents: 0,
    defaultOrderUnitPriceCents: 70, // R$ 0,70
    promotionalOrderUnitPriceCents: 45, // R$ 0,45
    promotionThresholdOrders: 500,
  },
} as const;

/** Ordem de exibição na página pública. */
export const PUBLIC_PLAN_CODES: readonly PlanCode[] = ["premium", "cents"] as const;

export function getPlanPricing(code: PlanCode): PlanPricing {
  return PLAN_PRICING[code];
}

export function isPublicPlanCode(value: string | null | undefined): value is PlanCode {
  return value === "premium" || value === "cents";
}

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

/**
 * `teste` é um plano INTERNO, não comercial — R$0,20/mês para validar o
 * cadastro real e o checkout da InfinityPay sem arriscar o preço de verdade
 * dos planos pagos. Nunca aparece na página pública nem no seletor de plano
 * do cadastro: só é alcançável por quem abre `/signup?plan=teste` direto.
 */
export type PlanCode = "premium" | "cents" | "teste";

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
    // Sem taxa de entrada. O CENTS passou a ser só consumo: o cliente entra,
    // usa os 30 dias grátis e, depois disso, paga apenas pelos pedidos que
    // realmente entraram. Zero aqui desliga a taxa em TODOS os caminhos —
    // fatura, previsão do ciclo e checkout de entrada leem este mesmo número.
    setupFeeCents: 0,
    monthlyFeeCents: 0,
    defaultOrderUnitPriceCents: 70, // R$ 0,70
    promotionalOrderUnitPriceCents: 45, // R$ 0,45
    promotionThresholdOrders: 500,
  },
  teste: {
    code: "teste",
    name: "TESTE (interno)",
    description: "Plano interno para validar cadastro e checkout. Não é vendido a clientes.",
    billingModel: "monthly_fixed",
    setupFeeCents: 0,
    monthlyFeeCents: 20, // R$ 0,20
    defaultOrderUnitPriceCents: 0,
    promotionalOrderUnitPriceCents: 0,
    promotionThresholdOrders: 0,
  },
} as const;

/** Ordem de exibição na página pública. `teste` fica de fora de propósito. */
export const PUBLIC_PLAN_CODES: readonly PlanCode[] = ["premium", "cents"] as const;

/** Todo código de plano que o sistema reconhece, incluindo os internos. */
export const ALL_PLAN_CODES: readonly PlanCode[] = ["premium", "cents", "teste"] as const;

/**
 * Valor de `pizzerias.billing_model` correspondente a cada plano.
 *
 * Atenção aos nomes: a coluna de `pizzerias` usa `fixed`/`per_order`, enquanto
 * as tabelas de cobrança usam `monthly_fixed`/`usage_per_order`. São
 * vocabulários diferentes para a mesma ideia.
 *
 * O banco exige o par correto (premium+fixed, cents+per_order). Como a coluna
 * tem default `fixed`, esquecer de preenchê-la não dá "campo obrigatório
 * faltando" — dá um par inválido, e só no CENTS. Foi assim que o cadastro
 * quebrou: o PREMIUM passava e o CENTS não.
 *
 * A regra mora aqui para não ser reescrita à mão em cada lugar que grava um
 * plano.
 */
export type CompanyBillingModel = "fixed" | "per_order";

export const COMPANY_BILLING_MODEL: Readonly<Record<PlanCode, CompanyBillingModel>> = {
  premium: "fixed",
  cents: "per_order",
  teste: "fixed",
} as const;

export function getPlanPricing(code: PlanCode): PlanPricing {
  return PLAN_PRICING[code];
}

/** Só os planos vendidos na página comercial e no seletor do cadastro. */
export function isPublicPlanCode(value: string | null | undefined): value is PlanCode {
  return value === "premium" || value === "cents";
}

/**
 * Todo plano que o sistema sabe processar, incluindo `teste`. Usada nos
 * pontos que precisam aceitar o plano interno (link direto do cadastro,
 * retorno do checkout) sem expô-lo na vitrine pública.
 */
export function isKnownPlanCode(value: string | null | undefined): value is PlanCode {
  return (ALL_PLAN_CODES as readonly string[]).includes(value ?? "");
}

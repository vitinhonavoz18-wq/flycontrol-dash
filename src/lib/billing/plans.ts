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
export type PlanCode = "premium" | "premium_anual" | "cents" | "teste";

/** Como o plano cobra. Determina qual caminho do motor de cobrança roda. */
export type BillingModel = "monthly_fixed" | "usage_per_order";

export type PlanPricing = {
  readonly code: PlanCode;
  readonly name: string;
  readonly description: string;
  readonly billingModel: BillingModel;
  /** Cobrada uma única vez, na primeira fatura. */
  readonly setupFeeCents: Cents;
  /**
   * Valor fixo cobrado a cada CICLO do plano. Zero em planos por uso.
   *
   * No mensal o ciclo é um mês; no anual, doze meses. Por isso o nome não é
   * "mensalidade": no Premium Anual este número é R$ 598,80 — o que sai do
   * bolso do cliente de uma vez —, e não os R$ 49,90 do equivalente mensal.
   * Confundir os dois é o erro que faria o anual cobrar R$ 598,80 todo mês.
   */
  readonly cycleFeeCents: Cents;
  /** Duração do ciclo em meses: 1 (mensal) ou 12 (anual). */
  readonly billingIntervalMonths: 1 | 12;
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
    name: "Premium Mensal",
    description:
      "Gestão completa para operações que precisam de mais controle, equipe e recursos avançados.",
    billingModel: "monthly_fixed",
    setupFeeCents: 0,
    // R$ 89,90 por mês, para contratações NOVAS. Quem contratou antes (ex.:
    // R$ 375,00) continua pagando o que contratou: a fatura lê o preço da
    // versão gravada na assinatura, nunca este número.
    cycleFeeCents: 8_990,
    billingIntervalMonths: 1,
    defaultOrderUnitPriceCents: 0,
    promotionalOrderUnitPriceCents: 0,
    promotionThresholdOrders: 0,
  },
  premium_anual: {
    code: "premium_anual",
    name: "Premium Anual",
    description:
      "Os mesmos recursos do Premium Mensal, com um único pagamento por ano e o menor custo mensal.",
    billingModel: "monthly_fixed",
    setupFeeCents: 0,
    // R$ 598,80 de uma vez, valendo 12 meses. NUNCA R$ 49,90 por mês.
    cycleFeeCents: 59_880,
    billingIntervalMonths: 12,
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
    cycleFeeCents: 0,
    billingIntervalMonths: 1,
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
    cycleFeeCents: 20, // R$ 0,20
    billingIntervalMonths: 1,
    defaultOrderUnitPriceCents: 0,
    promotionalOrderUnitPriceCents: 0,
    promotionThresholdOrders: 0,
  },
} as const;

/** Ordem de exibição na página pública. `teste` fica de fora de propósito. */
export const PUBLIC_PLAN_CODES: readonly PlanCode[] = [
  "premium",
  "premium_anual",
  "cents",
] as const;

/** Todo código de plano que o sistema reconhece, incluindo os internos. */
const ALL_PLAN_CODES: readonly PlanCode[] = ["premium", "premium_anual", "cents", "teste"] as const;

/** Os dois jeitos de contratar o Premium. Mesmos recursos, ciclos diferentes. */
export const PREMIUM_PLAN_CODES = ["premium", "premium_anual"] as const;
export type PremiumPlanCode = (typeof PREMIUM_PLAN_CODES)[number];

export function isPremiumPlanCode(value: string | null | undefined): value is PremiumPlanCode {
  return value === "premium" || value === "premium_anual";
}

/**
 * Valor de `pizzerias.plan_type` — o que decide QUAIS telas a loja enxerga.
 *
 * Mensal e anual dão os mesmos recursos, então os dois gravam `premium`. O
 * banco só aceita `premium` ou `cents` nessa coluna; gravar `premium_anual`
 * ali seria recusado. A diferença entre mensal e anual mora na assinatura
 * (qual plano, qual versão de preço), não na ficha da loja.
 */
export const COMPANY_PLAN_TYPE: Readonly<Record<PlanCode, string>> = {
  premium: "premium",
  premium_anual: "premium",
  cents: "cents",
  // Mantido como sempre foi: o plano interno de teste grava o próprio código.
  teste: "teste",
} as const;

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
  premium_anual: "fixed",
  cents: "per_order",
  teste: "fixed",
} as const;

export function getPlanPricing(code: PlanCode): PlanPricing {
  return PLAN_PRICING[code];
}

/** Só os planos vendidos na página comercial e no seletor do cadastro. */
export function isPublicPlanCode(value: string | null | undefined): value is PlanCode {
  return (PUBLIC_PLAN_CODES as readonly string[]).includes(value ?? "");
}

/**
 * Todo plano que o sistema sabe processar, incluindo `teste`. Usada nos
 * pontos que precisam aceitar o plano interno (link direto do cadastro,
 * retorno do checkout) sem expô-lo na vitrine pública.
 */
export function isKnownPlanCode(value: string | null | undefined): value is PlanCode {
  return (ALL_PLAN_CODES as readonly string[]).includes(value ?? "");
}

// ---------------------------------------------------------------------------
// Contas que aparecem nos cards (sempre em centavos inteiros)
// ---------------------------------------------------------------------------

/**
 * Quanto o plano custa "por mês", só para comparar.
 *
 * No anual é R$ 598,80 ÷ 12 = R$ 49,90 — conta exata, sem arredondamento.
 * É um número de VITRINE: o cliente do anual nunca recebe uma cobrança de
 * R$ 49,90. Quem exibir este valor tem de exibir junto o valor cobrado.
 */
export function monthlyEquivalentCents(code: PlanCode): Cents {
  const p = PLAN_PRICING[code];
  return Math.round(p.cycleFeeCents / p.billingIntervalMonths);
}

/**
 * Quanto o anual economiza frente a 12 mensalidades do Premium Mensal.
 * 12 × R$ 89,90 = R$ 1.078,80; menos R$ 598,80 = R$ 480,00.
 */
export function annualSavingsCents(): Cents {
  return PLAN_PRICING.premium.cycleFeeCents * 12 - PLAN_PRICING.premium_anual.cycleFeeCents;
}

/**
 * A economia em porcentagem, com uma casa decimal, no formato brasileiro.
 * R$ 480,00 ÷ R$ 1.078,80 = 44,49…% → "44,5%".
 *
 * A conta é feita em milésimos inteiros para não depender de ponto flutuante
 * na hora de decidir o arredondamento.
 */
export function annualSavingsPercentLabel(): string {
  const base = PLAN_PRICING.premium.cycleFeeCents * 12;
  const permille = Math.round((annualSavingsCents() * 1000) / base); // 445
  return `${Math.floor(permille / 10)},${permille % 10}%`;
}

/** "mês" ou "ano" — para "R$ 89,90/mês" e "R$ 598,80/ano". */
export function cycleUnitLabel(intervalMonths: number): "mês" | "ano" {
  return intervalMonths === 12 ? "ano" : "mês";
}

/**
 * Regras da contratação do Premium (Mensal ou Anual) feita de dentro do
 * painel. Funções puras: nada de banco, nada de rede — por isso dá para
 * testar cada regra sozinha.
 *
 * A ideia central: só se vende o Premium a quem NÃO está pagando por ele.
 * Quem já tem um Premium pago e quer trocar entre mensal e anual, ou está
 * com fatura atrasada, é atendido pela equipe — porque nesses casos existe
 * dinheiro já pago (ou devido) que precisa ser acertado à mão, e uma troca
 * automática poderia cobrar duas vezes pelo mesmo mês. É o garçom não abrir
 * uma segunda comanda para a mesa que ainda não fechou a primeira.
 */

import type { Cents } from "./money";
import { OVERDUE_GRACE_DAYS } from "./collections";
import { formatCents } from "./money";
import {
  PLAN_PRICING,
  annualSavingsCents,
  annualSavingsPercentLabel,
  cycleUnitLabel,
  isPremiumPlanCode,
  monthlyEquivalentCents,
  type PremiumPlanCode,
} from "./plans";

/** A assinatura da loja hoje, como o banco a vê. `null` = loja sem assinatura. */
export type CurrentSubscription = {
  planCode: string | null;
  status: string;
} | null;

export type PurchaseDecision =
  | {
      ok: true;
      /**
       * `create`  — a loja não tem assinatura: nasce uma.
       * `switch`  — a assinatura existente troca de plano (no mesmo registro,
       *             para manter o histórico financeiro junto).
       */
      mode: "create" | "switch";
    }
  | { ok: false; code: PurchaseBlockCode; message: string };

export type PurchaseBlockCode =
  "already_premium" | "premium_switch_needs_team" | "has_debt" | "internal_plan" | "unknown_status";

/** Situações em que a loja já está pagando (ou deve) pelo plano atual. */
const PAYING_STATUSES = new Set(["active", "past_due", "suspended"]);
/** Situações em que nada foi pago ainda pelo plano atual. */
const UNPAID_STATUSES = new Set(["pending_activation", "pending_payment"]);
/** Assinatura encerrada: pode recomeçar, sem dívida pendente de acerto aqui. */
const ENDED_STATUSES = new Set(["canceled", "expired"]);

/**
 * Pode contratar `target` agora, pelo próprio painel?
 *
 * Regras (decididas para não haver cobrança duplicada):
 * - Fatura atrasada (past_due/suspended): primeiro quita, depois troca.
 * - Já paga um Premium (mensal ou anual, inclusive o antigo de R$ 375,00):
 *   não passa por este checkout. A troca é AGENDADA para a próxima
 *   renovação (ver scheduledPlanChange.ts), sem cobrança agora.
 * - Premium Mensal ainda no período grátis: pode antecipar para o Anual
 *   (paga hoje e o grátis termina); pedir o próprio Mensal de novo não faz
 *   sentido — ele já está contratado.
 * - CENTS (grátis ou ativo), Premium ainda não pago, assinatura encerrada ou
 *   loja sem assinatura: pode contratar.
 */
export function decidePremiumPurchase(
  current: CurrentSubscription,
  target: PremiumPlanCode,
): PurchaseDecision {
  if (!current) return { ok: true, mode: "create" };

  const { planCode, status } = current;

  if (status === "past_due" || status === "suspended") {
    return {
      ok: false,
      code: "has_debt",
      message:
        "Existe uma fatura em aberto. Quite a fatura atual na tela de cobrança e depois contrate o Premium.",
    };
  }

  if (ENDED_STATUSES.has(status)) return { ok: true, mode: "switch" };

  if (planCode === "cents") {
    if (status === "active" || status === "free_trial" || UNPAID_STATUSES.has(status)) {
      return { ok: true, mode: "switch" };
    }
    return unknownStatus();
  }

  if (isPremiumPlanCode(planCode)) {
    if (UNPAID_STATUSES.has(status)) return { ok: true, mode: "switch" };

    if (status === "free_trial") {
      if (planCode === target) {
        return {
          ok: false,
          code: "already_premium",
          message: `Você já está no ${PLAN_PRICING[target].name}, no período grátis. A primeira cobrança chega no fim dele.`,
        };
      }
      return { ok: true, mode: "switch" };
    }

    if (PAYING_STATUSES.has(status)) {
      return planCode === target
        ? {
            ok: false,
            code: "already_premium",
            message: `Você já é assinante do ${PLAN_PRICING[target].name}. Nada a contratar.`,
          }
        : {
            ok: false,
            code: "premium_switch_needs_team",
            message:
              "Você já é assinante Premium. A troca entre mensal e anual é agendada na tela Plano e cobrança: vale a partir da próxima renovação, sem cobrar duas vezes nem cobrar nada agora.",
          };
    }
    return unknownStatus();
  }

  // legacy_full_access, teste ou plano desconhecido: só pela equipe.
  return {
    ok: false,
    code: "internal_plan",
    message:
      "Seu plano atual é gerenciado pela equipe da FlyControl. Fale com a gente para trocar.",
  };
}

function unknownStatus(): PurchaseDecision {
  return {
    ok: false,
    code: "unknown_status",
    message: "Não foi possível contratar agora. Fale com a equipe da FlyControl.",
  };
}

// ---------------------------------------------------------------------------
// O que a tela de checkout mostra
// ---------------------------------------------------------------------------

export type CheckoutSummary = {
  planCode: PremiumPlanCode;
  planName: string;
  /** "Total a pagar hoje". */
  totalTodayCents: Cents;
  /** "Período de acesso". */
  accessPeriodLabel: string;
  intervalMonths: 1 | 12;
  /** Valor da renovação (o mesmo do contrato — sem reajuste automático). */
  renewalAmountCents: Cents;
  /** Equivalente mensal — só para o anual, e sempre ao lado do valor cobrado. */
  monthlyEquivalentCents: Cents | null;
  savingsCents: Cents | null;
  savingsPercentLabel: string | null;
  /** Frases prontas, para a tela e para os testes conferirem o texto. */
  lines: {
    totalToday: string;
    planContracted: string;
    accessPeriod: string;
    renewal: string;
    cancel: string;
    notMonthly: string | null;
  };
};

/**
 * Monta o resumo do checkout a partir do catálogo.
 *
 * A InfinityPay não tem assinatura recorrente na API de checkout que usamos
 * (só link de pagamento + reconferência). Por isso a renovação NÃO é débito
 * automático: no fim do período o sistema emite uma nova cobrança e manda o
 * link; o cliente paga se quiser continuar. A tela diz exatamente isso.
 */
export function buildCheckoutSummary(target: PremiumPlanCode): CheckoutSummary {
  const pricing = PLAN_PRICING[target];
  const annual = pricing.billingIntervalMonths === 12;
  const total = pricing.cycleFeeCents;
  const unit = cycleUnitLabel(pricing.billingIntervalMonths);
  const period = annual ? "12 meses" : "1 mês";

  return {
    planCode: target,
    planName: pricing.name,
    totalTodayCents: total,
    accessPeriodLabel: period,
    intervalMonths: pricing.billingIntervalMonths,
    renewalAmountCents: total,
    monthlyEquivalentCents: annual ? monthlyEquivalentCents(target) : null,
    savingsCents: annual ? annualSavingsCents() : null,
    savingsPercentLabel: annual ? annualSavingsPercentLabel() : null,
    lines: {
      totalToday: `Total a pagar hoje: ${formatCents(total)}`,
      planContracted: `Plano contratado: ${pricing.name}`,
      accessPeriod: `Período de acesso: ${period}`,
      renewal:
        `Renovação: não é débito automático. No último dia ${annual ? "dos 12 meses" : "de cada mês"}, ` +
        `o sistema emite uma nova cobrança de ${formatCents(total)}/${unit} (o mesmo valor ` +
        `contratado, sem reajuste automático) e mostra o link de pagamento no painel, com 7 dias ` +
        `para pagar.`,
      cancel:
        "Para não renovar, basta não pagar a nova cobrança — ou pedir o cancelamento à equipe da " +
        `FlyControl antes do fim do período. Atenção: se a cobrança da renovação não for paga, ` +
        `depois do vencimento e de ${OVERDUE_GRACE_DAYS} dias de tolerância o acesso ao painel é suspenso até o pagamento ` +
        "ou o cancelamento.",
      notMonthly: annual
        ? `${formatCents(monthlyEquivalentCents(target))}/mês é apenas o valor equivalente, para comparar. Você paga ${formatCents(total)} uma única vez por 12 meses — não existe cobrança mensal de ${formatCents(monthlyEquivalentCents(target))}.`
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// O que o navegador pode mandar
// ---------------------------------------------------------------------------

/**
 * Filtra o pedido de contratação vindo do navegador.
 *
 * Sai daqui SÓ o código do plano e o aceite. Qualquer outro campo — valor,
 * loja, assinatura — é descartado, mesmo que venha no pedido: quem decide
 * isso é o servidor, a partir do login. É o caixa que ignora o "pode cobrar
 * R$ 10" escrito pelo cliente na comanda.
 */
export function parseStartCheckoutInput(raw: unknown): {
  planCode: PremiumPlanCode;
  acceptedTerms: true;
} {
  const d = (raw ?? {}) as { planCode?: unknown; acceptedTerms?: unknown };
  if (typeof d.planCode !== "string" || !isPremiumPlanCode(d.planCode)) {
    throw new Error("Plano inválido.");
  }
  if (d.acceptedTerms !== true) {
    throw new Error("Confirme que leu o valor, o período e a regra de renovação.");
  }
  return { planCode: d.planCode, acceptedTerms: true };
}

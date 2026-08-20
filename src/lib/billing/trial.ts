/**
 * Período gratuito de 30 dias.
 *
 * Funções puras: recebem datas e números, devolvem datas e números. Nada de
 * rede, nada de `new Date()` escondido — quem chama informa o "agora". É o que
 * permite testar "faltam 23 dias" sem esperar 7 dias passarem.
 *
 * IMPORTANTE: nada aqui CONCEDE trial. Conceder é decisão do banco, na função
 * `start_free_trial` — se a concessão dependesse do navegador, sair e entrar de
 * novo renderia 30 dias novos toda vez.
 */

import type { Cents } from "./money";
import { computeCycleEnd, computeNextCycleStart } from "./billingEngine";
import { getPlanPricing, type PlanCode } from "./plans";

/** Trinta dias são trinta dias. Não "um mês", que varia de 28 a 31. */
export const TRIAL_DURATION_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Plano em que um cadastro novo entra.
 *
 * O CENTS é o que combina com a promessa "pague só depois de usar": sem
 * mensalidade, cobrança pelo que rodou. O PREMIUM continua existindo e passa a
 * ser oferecido como upgrade dentro do painel.
 */
export const TRIAL_PLAN_CODE: PlanCode = "cents";

/**
 * Situação comercial da assinatura, no vocabulário das telas.
 *
 * Deriva do estado gravado no banco — nunca é decidida pela tela. Duas
 * assinaturas em `active` podem estar em situações diferentes (dentro do
 * primeiro ciclo de uso ou já em regime), e é o tipo do ciclo aberto que
 * separa uma da outra.
 */
export type SubscriptionPhase =
  | "free_trial"
  | "usage_cycle"
  | "active"
  | "payment_pending"
  | "overdue"
  | "suspended"
  | "canceled";

export const SUBSCRIPTION_PHASE_LABELS: Record<SubscriptionPhase, string> = {
  free_trial: "Período grátis",
  usage_cycle: "Primeiro ciclo cobrado",
  active: "Ativa",
  payment_pending: "Aguardando pagamento",
  overdue: "Pagamento em atraso",
  suspended: "Suspensa",
  canceled: "Encerrada",
};

export function deriveSubscriptionPhase(input: {
  status: string | null | undefined;
  /** Tipo do ciclo aberto no momento: 'free_trial' | 'usage'. */
  cycleType?: string | null;
  /** Quantos ciclos cobrados já fecharam. Zero = ainda no primeiro. */
  closedUsageCycles?: number;
}): SubscriptionPhase {
  switch (input.status) {
    case "free_trial":
      return "free_trial";
    case "pending_payment":
    case "pending_activation":
      return "payment_pending";
    case "past_due":
      return "overdue";
    case "suspended":
      return "suspended";
    case "canceled":
    case "expired":
      return "canceled";
    case "active":
      // Recém-saída do período gratuito: o primeiro ciclo cobrado merece um
      // nome próprio, porque é o único em que o cliente ainda não viu fatura
      // nenhuma e precisa entender que a conta chega só no fim.
      return (input.closedUsageCycles ?? 0) === 0 ? "usage_cycle" : "active";
    default:
      return "active";
  }
}

/** Fim do período gratuito a partir do início. */
export function computeTrialEnd(start: Date, durationDays = TRIAL_DURATION_DAYS): Date {
  return new Date(start.getTime() + durationDays * DAY_MS);
}

export type TrialProgress = {
  /** Dias inteiros que ainda faltam. Nunca negativo. */
  daysRemaining: number;
  /** Dias já usados, saturado na duração total. */
  daysElapsed: number;
  durationDays: number;
  /** 0 a 100. Quanto do período já passou. */
  percent: number;
  ended: boolean;
  /** Frase pronta para a tela. */
  message: string;
};

/**
 * Quanto falta do período gratuito.
 *
 * `daysRemaining` arredonda para cima de propósito: no último dia o cliente
 * lê "1 dia restante", e não "0 dias restantes" enquanto ainda pode usar.
 */
export function calculateTrialProgress(input: {
  trialStart: Date;
  trialEnd: Date;
  now: Date;
}): TrialProgress {
  const totalMs = Math.max(1, input.trialEnd.getTime() - input.trialStart.getTime());
  const durationDays = Math.max(1, Math.round(totalMs / DAY_MS));

  const remainingMs = input.trialEnd.getTime() - input.now.getTime();
  const ended = remainingMs <= 0;

  const daysRemaining = ended ? 0 : Math.ceil(remainingMs / DAY_MS);
  const daysElapsed = Math.min(durationDays, Math.max(0, durationDays - daysRemaining));
  const percent = Math.min(100, Math.max(0, (daysElapsed / durationDays) * 100));

  return {
    daysRemaining,
    daysElapsed,
    durationDays,
    percent,
    ended,
    message: ended
      ? "Seu período grátis terminou. O ciclo cobrado já começou."
      : `${daysRemaining} ${daysRemaining === 1 ? "dia restante" : "dias restantes"}`,
  };
}

export type TrialTimeline = {
  trialStart: Date;
  trialEnd: Date;
  /** Início do primeiro ciclo cobrado: no instante seguinte ao fim do grátis. */
  usageCycleStart: Date;
  usageCycleEnd: Date;
  /**
   * Quando a primeira cobrança é gerada: no fechamento do ciclo de uso.
   * Nunca antes — é isso que "pague só depois de usar" significa.
   */
  firstChargeAt: Date;
};

/**
 * A linha do tempo inteira, a partir do instante da ativação.
 *
 * Serve para a tela de conclusão do cadastro mostrar datas reais em vez de
 * "em breve". O ciclo de uso segue a regra mensal que já existia — trocá-la
 * por 30 dias mudaria a cobrança de quem já é cliente.
 */
export function buildTrialTimeline(
  activationAt: Date,
  durationDays = TRIAL_DURATION_DAYS,
): TrialTimeline {
  const trialStart = activationAt;
  const trialEnd = computeTrialEnd(trialStart, durationDays);
  const usageCycleStart = trialEnd;
  const usageCycleEnd = computeCycleEnd(usageCycleStart);

  return {
    trialStart,
    trialEnd,
    usageCycleStart,
    usageCycleEnd,
    firstChargeAt: usageCycleEnd,
  };
}

/**
 * Início do próximo ciclo depois de um que acabou de fechar.
 *
 * Ciclo gratuito tem duração fixa em dias, então o próximo começa no instante
 * seguinte ao fim dele. Ciclo cobrado mantém a âncora mensal de sempre.
 * Misturar as duas regras deixaria um buraco no calendário — e pedido feito
 * dentro do buraco não pertenceria a ciclo nenhum.
 */
export function computeCycleStartAfter(input: {
  cycleType: string | null | undefined;
  cycleStart: Date;
  cycleEnd: Date;
}): Date {
  return input.cycleType === "free_trial"
    ? new Date(input.cycleEnd.getTime() + 1)
    : computeNextCycleStart(input.cycleStart);
}

/** Preço por pedido que passa a valer quando o período gratuito acaba. */
export function priceAfterTrialCents(planCode: PlanCode = TRIAL_PLAN_CODE): Cents {
  return getPlanPricing(planCode).defaultOrderUnitPriceCents;
}

/** Data no formato brasileiro, ou travessão quando não há data. */
export function formatTrialDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

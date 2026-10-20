/**
 * Troca de plano AGENDADA para a próxima renovação — regras puras.
 *
 * Para quem já paga o Premium. Nada é cobrado na hora: a troca fica anotada
 * e o fechamento do ciclo (o robô diário) abre o ciclo seguinte já no plano
 * novo, com a fatura no valor novo. Assim não existe cobrança dobrada nem
 * acerto de dias: o período já pago termina como foi contratado, e o novo
 * começa no dia seguinte.
 *
 * Exemplo do dia a dia: o cliente que almoça todo dia no prato feito e avisa
 * "a partir do mês que vem quero o pacote mensal". O mês atual segue como
 * estava; o pacote começa no dia 1º, sem cobrar duas vezes o mesmo almoço.
 */

import { formatCents } from "./money";
import { PLAN_PRICING, cycleUnitLabel, isPremiumPlanCode, type PremiumPlanCode } from "./plans";

export type CurrentPaidSubscription = {
  planCode: string | null;
  status: string;
  priceVersionId: string;
  /** Valor por ciclo que a loja contratou (versão de preço da assinatura). */
  contractedCycleFeeCents: number;
  /** Existe ciclo aberto? Sem ciclo = cobrança pausada pela equipe. */
  hasOpenCycle: boolean;
};

export type ScheduleDecision =
  | {
      ok: true;
      /**
       * `scheduled`: o robô aplica na próxima renovação.
       * `awaiting_team`: cobrança pausada — a escolha só é registrada; quem
       * aplica (e retoma a cobrança) é a equipe, à mão. Nada é reativado.
       */
      status: "scheduled" | "awaiting_team";
      source: "customer_switch" | "legacy_offer";
    }
  | { ok: false; code: ScheduleBlockCode; message: string };

export type ScheduleBlockCode = "not_premium" | "not_active" | "same_plan" | "unknown";

/**
 * A assinatura está numa versão de preço que não é mais a da tabela? Hoje:
 * o Premium de R$ 375,00. É quem vê a oferta "Seu plano tem um preço novo".
 */
export function isLegacyPrice(
  sub: Pick<CurrentPaidSubscription, "planCode" | "contractedCycleFeeCents">,
): boolean {
  if (!isPremiumPlanCode(sub.planCode)) return false;
  return sub.contractedCycleFeeCents !== PLAN_PRICING[sub.planCode].cycleFeeCents;
}

/**
 * Pode agendar a troca para `target` (na versão de preço ativa hoje)?
 *
 * - Só para quem está com o Premium ATIVO (pagando em dia). Grátis e
 *   não-pago usam o checkout normal; fatura atrasada precisa ser quitada.
 * - Mesma versão de preço do plano atual = nada a trocar.
 * - Quem está num preço antigo pode ir para o MESMO plano no preço novo
 *   (R$ 375,00 → R$ 89,90): é a oferta de preço novo.
 */
export function decideScheduledChange(
  sub: CurrentPaidSubscription | null,
  target: PremiumPlanCode,
  targetActiveVersionId: string,
): ScheduleDecision {
  if (!sub || !isPremiumPlanCode(sub.planCode)) {
    return {
      ok: false,
      code: "not_premium",
      message: "A troca agendada é para quem já é assinante Premium.",
    };
  }
  if (sub.status !== "active") {
    return {
      ok: false,
      code: "not_active",
      message:
        sub.status === "past_due" || sub.status === "suspended"
          ? "Existe uma fatura em aberto. Quite a fatura atual e depois agende a troca."
          : "A troca agendada vale para assinaturas ativas. Use a contratação normal.",
    };
  }
  if (sub.priceVersionId === targetActiveVersionId) {
    return {
      ok: false,
      code: "same_plan",
      message: `Você já está no ${PLAN_PRICING[target].name} com o preço atual.`,
    };
  }

  const legacy = isLegacyPrice(sub);
  return {
    ok: true,
    status: sub.hasOpenCycle ? "scheduled" : "awaiting_team",
    source: legacy ? "legacy_offer" : "customer_switch",
  };
}

/** "R$ 89,90/mês" ou "R$ 598,80/ano" — o preço de tabela do plano alvo. */
export function targetPriceLabel(target: PremiumPlanCode): string {
  const p = PLAN_PRICING[target];
  return `${formatCents(p.cycleFeeCents)}/${cycleUnitLabel(p.billingIntervalMonths)}`;
}

/**
 * Dia em que a troca passa a valer: o dia seguinte ao fim do ciclo atual.
 * Formatado dd/mm/aaaa no fuso de São Paulo (o do restaurante).
 */
export function effectiveDateLabel(cycleEnd: string | null): string | null {
  if (!cycleEnd) return null;
  const end = new Date(cycleEnd);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end.getTime() + 1);
  return start.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** A frase que a tela mostra para uma troca agendada. */
export function scheduledChangeSentence(input: {
  target: PremiumPlanCode;
  status: "scheduled" | "awaiting_team";
  cycleEnd: string | null;
}): string {
  const plano = PLAN_PRICING[input.target].name;
  const preco = targetPriceLabel(input.target);
  if (input.status === "awaiting_team") {
    return (
      `Sua escolha está registrada: passar para o ${plano} por ${preco}. ` +
      "Sua cobrança está pausada pela equipe da FlyControl; a troca vale quando a equipe retomar a cobrança — nada é cobrado antes disso."
    );
  }
  const quando = effectiveDateLabel(input.cycleEnd);
  return quando
    ? `A partir de ${quando} você passa para o ${plano} por ${preco}.`
    : `Na próxima renovação você passa para o ${plano} por ${preco}.`;
}

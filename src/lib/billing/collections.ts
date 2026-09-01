/**
 * Política de cobrança: o que fazer com uma assinatura que não pagou uma
 * fatura no prazo.
 *
 * Puro de propósito, como o resto do motor de cobrança (ver billingEngine.ts):
 * dado o estado atual e as datas, decide a ação — sem tocar em banco, sem
 * chamar a InfinityPay. Isso permite testar a regra do prazo de tolerância
 * sem precisar simular nada externo.
 */

/**
 * Horas de tolerância depois do vencimento antes de suspender o acesso.
 *
 * Cortar o acesso no exato instante do vencimento derrubaria um restaurante
 * por um PIX que ainda está compensando. Vinte e quatro horas é o prazo que
 * cobre a compensação de um pagamento feito no dia do vencimento, sem deixar
 * o atraso virar hábito.
 *
 * Era 3 dias até 01/09/2026, quando passou a 24 horas por decisão comercial.
 */
export const OVERDUE_GRACE_HOURS = 24;

export type CollectionsAction = "none" | "mark_past_due" | "suspend";

/**
 * Decide a ação para UMA fatura vencida.
 *
 * - Antes do vencimento: nada a fazer.
 * - Vencida, dentro da tolerância: sinaliza atraso (`past_due`), mas o
 *   acesso continua liberado — é o que `isOperational()` já espera.
 * - Vencida, além da tolerância: suspende de verdade.
 *
 * Não reemite a mesma ação duas vezes: se a assinatura já está no status
 * que a ação levaria, devolve "none" para o chamador não gravar o mesmo
 * evento em auditoria todo dia.
 */
export function decideCollectionsAction(input: {
  dueAt: Date;
  now: Date;
  subscriptionStatus: string;
}): CollectionsAction {
  if (input.now < input.dueAt) return "none";

  const graceEndsAt = new Date(input.dueAt.getTime() + OVERDUE_GRACE_HOURS * 60 * 60 * 1000);

  if (input.now >= graceEndsAt) {
    return input.subscriptionStatus === "suspended" ? "none" : "suspend";
  }

  return input.subscriptionStatus === "active" ? "mark_past_due" : "none";
}

/**
 * Reflexo do status rico da assinatura no campo simples que a porta de
 * acesso (`pizzerias.subscription_status`) confere de verdade.
 *
 * Os dois campos existem em tabelas diferentes por razões históricas — este
 * é o único lugar que traduz um para o outro, para nunca divergirem.
 */
export function pizzeriaAccessStatusFor(subscriptionStatus: string): "active" | "suspended" {
  return subscriptionStatus === "active" || subscriptionStatus === "past_due"
    ? "active"
    : "suspended";
}

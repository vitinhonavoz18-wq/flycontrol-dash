/**
 * Aplica a troca de plano agendada no fechamento do ciclo. Servidor apenas.
 *
 * Chamado por `closeBillingCycle` (o mesmo caminho do robô diário) ANTES de
 * calcular a fatura: assim a fatura de renovação já sai no valor do plano
 * novo, e o ciclo seguinte abre com a duração do plano novo (1 ou 12 meses,
 * lida da versão de preço pela `open_billing_cycle`).
 *
 * Só aplica troca `scheduled`. A `awaiting_team` (cobrança pausada) nunca é
 * aplicada aqui — e, de qualquer forma, assinatura sem ciclo aberto não passa
 * pelo fechamento.
 *
 * Idempotente. A assinatura só muda se ainda estiver na versão de origem da
 * troca; a troca só vira `applied` uma vez. Rodar de novo depois de uma falha
 * no meio termina o serviço sem repetir nada.
 */

import type { BillingDb } from "./supabaseBridge";

export type ScheduledChangeRow = {
  id: string;
  subscription_id: string;
  from_price_version_id: string;
  to_plan_id: string;
  to_price_version_id: string;
  source: string;
};

export type AppliedChange = {
  changeId: string;
  newPlanId: string;
  newPriceVersionId: string;
  previousPriceVersionId: string;
};

/** Postgres: relação inexistente — migration da troca agendada não aplicada. */
const UNDEFINED_TABLE = "42P01";

export async function applyScheduledPlanChange(
  db: BillingDb,
  sub: { id: string; company_id: string; plan_price_version_id: string },
  closingCycleId: string,
  now: Date = new Date(),
): Promise<AppliedChange | null> {
  const { data, error } = await db
    .from("subscription_plan_changes")
    .select("id, subscription_id, from_price_version_id, to_plan_id, to_price_version_id, source")
    .eq("subscription_id", sub.id)
    .eq("status", "scheduled")
    .limit(1);

  if (error) {
    // Sem a tabela, não há troca a aplicar: o fechamento segue como sempre.
    if (error.code !== UNDEFINED_TABLE) {
      console.error(`[billing] falha ao ler troca agendada de ${sub.id}: ${error.message}`);
    }
    return null;
  }
  const change = ((data ?? []) as ScheduledChangeRow[])[0];
  if (!change) return null;

  const nowIso = now.toISOString();

  const { data: planRaw } = await db
    .from("plans")
    .select("id, billing_model")
    .eq("id", change.to_plan_id)
    .maybeSingle();
  const plan = planRaw as { id: string; billing_model: string } | null;
  if (!plan) {
    console.error(
      `[billing] troca ${change.id}: plano de destino não encontrado; ciclo segue no atual.`,
    );
    return null;
  }

  if (sub.plan_price_version_id === change.from_price_version_id) {
    const { data: updated } = await db
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        plan_price_version_id: change.to_price_version_id,
        billing_model: plan.billing_model,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      .eq("plan_price_version_id", change.from_price_version_id)
      .select("id")
      .maybeSingle();
    if (!updated) {
      console.error(
        `[billing] troca ${change.id}: assinatura mudou no meio; ciclo segue no atual.`,
      );
      return null;
    }
  } else if (sub.plan_price_version_id !== change.to_price_version_id) {
    // A assinatura foi mudada por outro caminho (ex.: administrador). A troca
    // agendada perdeu o sentido: não aplica e fica registrada para a equipe.
    await db
      .from("subscription_plan_changes")
      .update({
        status: "canceled",
        canceled_at: nowIso,
        note: "assinatura mudou de versão por outro caminho antes da renovação",
        updated_at: nowIso,
      })
      .eq("id", change.id)
      .eq("status", "scheduled");
    return null;
  }

  await db
    .from("subscription_plan_changes")
    .update({
      status: "applied",
      applied_at: nowIso,
      applied_cycle_id: closingCycleId,
      updated_at: nowIso,
    })
    .eq("id", change.id)
    .eq("status", "scheduled");

  await db.from("subscription_events").insert({
    subscription_id: sub.id,
    company_id: sub.company_id,
    event_type: "scheduled_plan_change_applied",
    reason: "Troca de plano agendada pelo cliente aplicada na renovação",
    metadata: {
      plan_change_id: change.id,
      source: change.source,
      from_price_version_id: change.from_price_version_id,
      to_price_version_id: change.to_price_version_id,
      closing_cycle_id: closingCycleId,
    },
  });

  return {
    changeId: change.id,
    newPlanId: plan.id,
    newPriceVersionId: change.to_price_version_id,
    previousPriceVersionId: change.from_price_version_id,
  };
}

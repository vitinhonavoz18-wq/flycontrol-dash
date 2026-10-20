/**
 * Troca de plano agendada — funções de servidor do painel.
 *
 *   - `getPlanChangeOffer`: o que a tela "Plano e cobrança" precisa para
 *     oferecer a troca (ou a oferta de preço novo) e mostrar a troca marcada.
 *   - `schedulePlanChange`: marca a troca para a próxima renovação.
 *   - `cancelScheduledPlanChange`: desfaz a troca marcada.
 *
 * Mesmas regras do checkout: a loja é a do usuário logado (nunca a que o
 * navegador disser), e o preço é a versão ATIVA do plano no banco. Nenhuma
 * dessas funções cobra nada, abre ciclo ou reativa cobrança.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb, type BillingDb } from "./supabaseBridge";
import { PLAN_PRICING, PREMIUM_PLAN_CODES, isPremiumPlanCode, type PremiumPlanCode } from "./plans";
import {
  decideScheduledChange,
  isLegacyPrice,
  scheduledChangeSentence,
  targetPriceLabel,
  type CurrentPaidSubscription,
  type ScheduleDecision,
} from "./scheduledPlanChange";

export type PlanChangeOffer = {
  /** A loja está num preço antigo (ex.: R$ 375,00)? Mostra a oferta de preço novo. */
  legacy: boolean;
  /** Valor contratado hoje, por ciclo, e a unidade ("mês"/"ano"). */
  contractedCycleFeeCents: number;
  intervalMonths: number;
  /** Cobrança pausada pela equipe (sem ciclo aberto). */
  billingPaused: boolean;
  cycleEnd: string | null;
  currentPlanCode: PremiumPlanCode;
  options: Record<PremiumPlanCode, { decision: ScheduleDecision; priceLabel: string }>;
  scheduled: {
    id: string;
    targetPlanCode: PremiumPlanCode;
    status: "scheduled" | "awaiting_team";
    source: string;
    sentence: string;
  } | null;
} | null;

type LoadedState = {
  companyId: string;
  sub: CurrentPaidSubscription & {
    id: string;
    planId: string;
    cycleEnd: string | null;
    intervalMonths: number;
  };
};

async function loadState(db: BillingDb, userId: string): Promise<LoadedState | null> {
  const { data: company } = await supabaseAdmin
    .from("pizzerias")
    .select("id")
    .eq("owner_id", userId)
    .neq("status", "deleted")
    .neq("status", "inactive")
    .limit(1)
    .maybeSingle();
  const companyId = (company as { id: string } | null)?.id;
  if (!companyId) return null;

  const { data: subs } = await db
    .from("subscriptions")
    .select(
      "id, status, plan_id, plan_price_version_id, plans(code), " +
        "plan_price_versions(monthly_fee_cents, billing_interval_months)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (
    (subs ?? []) as Array<{
      id: string;
      status: string;
      plan_id: string;
      plan_price_version_id: string;
      plans: { code: string } | null;
      plan_price_versions: {
        monthly_fee_cents: number;
        billing_interval_months: number | null;
      } | null;
    }>
  )[0];
  if (!row) return null;

  // Ciclo ABERTO de verdade (não o "ciclo corrente" da ficha, que na ADEGA
  // aponta para um ciclo cancelado).
  const { data: open } = await db
    .from("billing_cycles")
    .select("id, cycle_end")
    .eq("subscription_id", row.id)
    .eq("status", "open")
    .limit(1);
  const openCycle = ((open ?? []) as Array<{ id: string; cycle_end: string }>)[0] ?? null;

  return {
    companyId,
    sub: {
      id: row.id,
      planId: row.plan_id,
      planCode: row.plans?.code ?? null,
      status: row.status,
      priceVersionId: row.plan_price_version_id,
      contractedCycleFeeCents: Number(row.plan_price_versions?.monthly_fee_cents ?? 0),
      intervalMonths: Number(row.plan_price_versions?.billing_interval_months ?? 1) || 1,
      hasOpenCycle: !!openCycle,
      cycleEnd: openCycle?.cycle_end ?? null,
    },
  };
}

/** Versão ATIVA (preço de tabela) de cada plano Premium, conferida contra a tela. */
async function loadActiveVersions(
  db: BillingDb,
): Promise<Record<PremiumPlanCode, { planId: string; versionId: string } | null>> {
  const out = { premium: null, premium_anual: null } as Record<
    PremiumPlanCode,
    { planId: string; versionId: string } | null
  >;
  for (const code of PREMIUM_PLAN_CODES) {
    const { data: plan } = await db
      .from("plans")
      .select("id")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    const planId = (plan as { id: string } | null)?.id;
    if (!planId) continue;
    const { data: version } = await db
      .from("plan_price_versions")
      .select("id, monthly_fee_cents, billing_interval_months")
      .eq("plan_id", planId)
      .eq("is_active", true)
      .maybeSingle();
    const v = version as {
      id: string;
      monthly_fee_cents: number;
      billing_interval_months: number | null;
    } | null;
    // Banco e tela precisam concordar no valor; senão a opção não aparece.
    if (
      v &&
      Number(v.monthly_fee_cents) === PLAN_PRICING[code].cycleFeeCents &&
      Number(v.billing_interval_months ?? 1) === PLAN_PRICING[code].billingIntervalMonths
    ) {
      out[code] = { planId, versionId: v.id };
    }
  }
  return out;
}

async function loadPending(db: BillingDb, subscriptionId: string) {
  const { data, error } = await db
    .from("subscription_plan_changes")
    .select("id, to_plan_id, status, source")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "awaiting_team"])
    .limit(1);
  if (error) return null;
  return (
    (
      (data ?? []) as Array<{ id: string; to_plan_id: string; status: string; source: string }>
    )[0] ?? null
  );
}

export const getPlanChangeOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanChangeOffer> => {
    const db = asBillingDb(supabaseAdmin);
    const state = await loadState(db, context.userId);
    if (!state || !isPremiumPlanCode(state.sub.planCode)) return null;
    const sub = state.sub;
    const currentPlanCode = sub.planCode as PremiumPlanCode;

    const versions = await loadActiveVersions(db);
    const options = {} as NonNullable<PlanChangeOffer>["options"];
    for (const code of PREMIUM_PLAN_CODES) {
      const v = versions[code];
      options[code] = {
        decision: v
          ? decideScheduledChange(sub, code, v.versionId)
          : { ok: false, code: "unknown", message: "Plano indisponível no momento." },
        priceLabel: targetPriceLabel(code),
      };
    }

    let scheduled: NonNullable<PlanChangeOffer>["scheduled"] = null;
    const pending = await loadPending(db, sub.id);
    if (pending) {
      const target = (Object.keys(versions) as PremiumPlanCode[]).find(
        (c) => versions[c]?.planId === pending.to_plan_id,
      );
      if (target) {
        const status = pending.status as "scheduled" | "awaiting_team";
        scheduled = {
          id: pending.id,
          targetPlanCode: target,
          status,
          source: pending.source,
          sentence: scheduledChangeSentence({ target, status, cycleEnd: sub.cycleEnd }),
        };
      }
    }

    return {
      legacy: isLegacyPrice(sub),
      contractedCycleFeeCents: sub.contractedCycleFeeCents,
      intervalMonths: sub.intervalMonths,
      billingPaused: !sub.hasOpenCycle,
      cycleEnd: sub.cycleEnd,
      currentPlanCode,
      options,
      scheduled,
    };
  });

/** Só o plano e o aceite passam do navegador. Loja e preço são do servidor. */
export function parseScheduleInput(raw: unknown): { planCode: PremiumPlanCode; accepted: true } {
  const d = (raw ?? {}) as { planCode?: unknown; accepted?: unknown };
  if (typeof d.planCode !== "string" || !isPremiumPlanCode(d.planCode)) {
    throw new Error("Plano inválido.");
  }
  if (d.accepted !== true) throw new Error("Confirme que leu como a troca funciona.");
  return { planCode: d.planCode, accepted: true };
}

export const schedulePlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planCode: string; accepted: boolean }) => parseScheduleInput(d))
  .handler(async ({ data, context }) => {
    const db = asBillingDb(supabaseAdmin);
    const state = await loadState(db, context.userId);
    if (!state) throw new Error("Nenhuma assinatura encontrada para este login.");
    const versions = await loadActiveVersions(db);
    const target = versions[data.planCode];
    if (!target) throw new Error("A tabela de preços está sendo atualizada. Tente mais tarde.");

    const decision = decideScheduledChange(state.sub, data.planCode, target.versionId);
    if (!decision.ok) throw new Error(decision.message);

    const nowIso = new Date().toISOString();

    // Escolher de novo substitui a escolha anterior (uma troca pendente por vez).
    await db
      .from("subscription_plan_changes")
      .update({
        status: "canceled",
        canceled_at: nowIso,
        note: "substituída por nova escolha",
        updated_at: nowIso,
      })
      .eq("subscription_id", state.sub.id)
      .in("status", ["scheduled", "awaiting_team"]);

    const { error } = await db.from("subscription_plan_changes").insert({
      subscription_id: state.sub.id,
      company_id: state.companyId,
      from_plan_id: state.sub.planId,
      from_price_version_id: state.sub.priceVersionId,
      to_plan_id: target.planId,
      to_price_version_id: target.versionId,
      status: decision.status,
      source: decision.source,
      effective_at: state.sub.cycleEnd,
      requested_by: context.userId,
      note:
        decision.status === "awaiting_team"
          ? "Cobrança pausada: aceite registrado; a equipe aplica ao retomar a cobrança."
          : null,
    });
    if (error) {
      console.error("[troca-agendada] não gravou:", error);
      throw new Error("Não foi possível agendar a troca agora. Tente novamente.");
    }

    await db.from("subscription_events").insert({
      subscription_id: state.sub.id,
      company_id: state.companyId,
      event_type: "plan_change_scheduled",
      performed_by: context.userId,
      reason:
        decision.source === "legacy_offer"
          ? `Cliente aceitou a oferta de preço novo: ${PLAN_PRICING[data.planCode].name}`
          : `Cliente agendou a troca para o ${PLAN_PRICING[data.planCode].name}`,
      metadata: {
        to_plan_code: data.planCode,
        to_price_version_id: target.versionId,
        from_price_version_id: state.sub.priceVersionId,
        status: decision.status,
        source: decision.source,
        billing_paused: decision.status === "awaiting_team",
        // Consentimento: o próprio cliente escolheu e confirmou.
        accepted_by_customer: true,
      },
    });

    return { status: decision.status };
  });

export const cancelScheduledPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = asBillingDb(supabaseAdmin);
    const state = await loadState(db, context.userId);
    if (!state) throw new Error("Nenhuma assinatura encontrada para este login.");
    const nowIso = new Date().toISOString();

    const { data: canceled } = await db
      .from("subscription_plan_changes")
      .update({
        status: "canceled",
        canceled_at: nowIso,
        note: "desfeita pelo cliente",
        updated_at: nowIso,
      })
      .eq("subscription_id", state.sub.id)
      .in("status", ["scheduled", "awaiting_team"])
      .select("id");

    const count = ((canceled ?? []) as unknown[]).length;
    if (count > 0) {
      await db.from("subscription_events").insert({
        subscription_id: state.sub.id,
        company_id: state.companyId,
        event_type: "plan_change_unscheduled",
        performed_by: context.userId,
        reason: "Cliente desfez a troca de plano agendada",
        metadata: {},
      });
    }
    return { canceled: count };
  });

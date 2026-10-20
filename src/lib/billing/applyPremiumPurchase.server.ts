/**
 * Aplica o Premium (Mensal ou Anual) a uma loja que PAGOU pelo painel.
 * Servidor apenas. Só é chamado depois que a InfinityPay confirmou o
 * pagamento e a intenção foi reivindicada uma única vez (ver
 * intentPayment.server.ts) — nunca duas vezes para o mesmo pagamento.
 *
 * Ordem, e por quê:
 *   1. Confere de novo, com o estado ATUAL da loja, se a contratação ainda
 *      faz sentido (entre clicar e pagar, a loja pode ter virado Premium por
 *      outro caminho). Se não fizer, NÃO aplica: registra para a equipe
 *      devolver o dinheiro. Melhor um pagamento parado para conferência do
 *      que dois planos cobrados.
 *   2. Fecha o ciclo aberto do plano velho com o que já aconteceu nele (no
 *      CENTS, os pedidos já feitos viram fatura; no grátis, nada é cobrado).
 *   3. Troca o plano NO MESMO registro de assinatura — o histórico de
 *      faturas continua junto, e o resto do sistema (que espera uma
 *      assinatura por loja) segue funcionando.
 *   4. Abre o primeiro ciclo do plano novo a partir de agora: 1 mês no
 *      mensal, 12 meses no anual (a duração vem da versão de preço).
 *   5. Libera os recursos Premium na ficha da loja.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BillingDb } from "./supabaseBridge";
import { closeBillingCycle } from "./closeCycle.server";
import { createRecurringCharge } from "./infinitypay/recurringCharge.server";
import { POLITICA_CENTS_VIGENTE } from "./centsTiers";
import { decidePremiumPurchase } from "./premiumCheckout";
import { COMPANY_BILLING_MODEL, COMPANY_PLAN_TYPE, isPremiumPlanCode } from "./plans";

export type PurchaseIntent = {
  id: string;
  company_id: string;
  plan_code: string;
  plan_price_version_id: string | null;
  expected_amount_cents: number;
  created_by: string | null;
};

export type ApplyResult =
  | { applied: true; subscriptionId: string; cycleId: string | null }
  | { applied: false; reason: string };

type SubRow = {
  id: string;
  status: string;
  plan_id: string;
  plan_price_version_id: string;
  current_cycle_id: string | null;
  plans: { code: string } | null;
};

/** Dependências trocáveis nos testes. */
export type ApplyDeps = {
  db: BillingDb;
  closeCycle: typeof closeBillingCycle;
  createCharge: typeof createRecurringCharge;
  updateCompany: (companyId: string, values: Record<string, unknown>) => Promise<void>;
  now: () => Date;
};

const defaultDeps = (db: BillingDb): ApplyDeps => ({
  db,
  closeCycle: closeBillingCycle,
  createCharge: createRecurringCharge,
  updateCompany: async (companyId, values) => {
    const { error } = await supabaseAdmin
      .from("pizzerias")
      .update(values as never)
      .eq("id", companyId);
    if (error) throw new Error(`ficha da loja não atualizou: ${error.message}`);
  },
  now: () => new Date(),
});

export async function applyPremiumPurchase(
  intent: PurchaseIntent,
  meta: {
    transactionNsu: string | null;
    captureMethod: string | null;
    paidAmountCents: number | null;
  },
  depsOrDb: ApplyDeps | BillingDb,
): Promise<ApplyResult> {
  const deps: ApplyDeps = "closeCycle" in depsOrDb ? depsOrDb : defaultDeps(depsOrDb);
  const { db } = deps;
  const now = deps.now();
  const nowIso = now.toISOString();

  if (!isPremiumPlanCode(intent.plan_code)) {
    return { applied: false, reason: `plano ${intent.plan_code} não é Premium` };
  }
  const target = intent.plan_code;

  // O plano e a versão de preço que o cliente PAGOU. A versão vem gravada na
  // intenção desde o clique em "Assinar": se a tabela mudar entre o clique e
  // o pagamento, vale o preço que ele viu e pagou.
  const { data: planRaw } = await db
    .from("plans")
    .select("id, billing_model")
    .eq("code", target)
    .maybeSingle();
  const plan = planRaw as { id: string; billing_model: string } | null;
  if (!plan || !intent.plan_price_version_id) {
    return { applied: false, reason: "plano ou versão de preço não encontrados" };
  }

  // A assinatura da loja (a mais recente, se por acaso houver mais de uma).
  const { data: subsRaw } = await db
    .from("subscriptions")
    .select("id, status, plan_id, plan_price_version_id, current_cycle_id, plans(code)")
    .eq("company_id", intent.company_id)
    .order("created_at", { ascending: false })
    .limit(1);
  const sub = ((subsRaw ?? []) as SubRow[])[0] ?? null;

  // 1. A contratação ainda faz sentido?
  const decision = decidePremiumPurchase(
    sub ? { planCode: sub.plans?.code ?? null, status: sub.status } : null,
    target,
  );
  if (!decision.ok) {
    await recordReview(db, intent, sub?.id ?? null, decision.message, meta);
    return { applied: false, reason: decision.message };
  }

  const previousPlanCode = sub?.plans?.code ?? null;
  let subscriptionId: string;

  if (sub) {
    // 2. Fecha o ciclo aberto do plano velho, com o preço do plano velho.
    const { data: openRaw } = await db
      .from("billing_cycles")
      .select("id, cycle_start, cycle_end")
      .eq("subscription_id", sub.id)
      .eq("status", "open")
      .limit(1);
    const open = (
      (openRaw ?? []) as Array<{ id: string; cycle_start: string; cycle_end: string }>
    )[0];

    if (open) {
      // O ciclo termina agora, e não na data em que terminaria: é isso que o
      // histórico tem de mostrar (CENTS de tal dia até a troca).
      if (now > new Date(open.cycle_start) && now < new Date(open.cycle_end)) {
        await db
          .from("billing_cycles")
          .update({ cycle_end: nowIso, updated_at: nowIso })
          .eq("id", open.id)
          .eq("status", "open");
      }

      const closed = await deps.closeCycle(open.id, { openNext: false });
      if (!closed.ok) {
        await recordReview(db, intent, sub.id, `ciclo anterior não fechou: ${closed.error}`, meta);
        return { applied: false, reason: closed.error };
      }

      // Pedidos já feitos no CENTS viram fatura própria, com link — igual ao
      // fechamento do fim do mês. Valor zero é paga sozinha.
      if (!closed.alreadyClosed && !closed.freeTrial && closed.invoiceId) {
        if (closed.totalAmountCents === 0) {
          await db
            .from("invoices")
            .update({ status: "paid", paid_at: nowIso })
            .eq("id", closed.invoiceId)
            .eq("status", "pending");
        } else {
          const charge = await deps.createCharge(closed.invoiceId);
          if (!charge.ok) {
            console.error(
              `[premium] fatura ${closed.invoiceId} do plano anterior sem link: ${charge.reason}`,
            );
          }
        }
      }
    }

    // 3. Troca de plano no mesmo registro.
    const { data: updated, error: updError } = await db
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        plan_price_version_id: intent.plan_price_version_id,
        billing_model: plan.billing_model,
        status: "active",
        activated_at: nowIso,
        billing_anchor_day: now.getUTCDate(),
        payment_provider: "infinitypay",
        canceled_at: null,
        suspended_at: null,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      // Ninguém mexeu nela desde a leitura (dois avisos juntos, admin, etc.).
      .eq("status", sub.status)
      .select("id")
      .maybeSingle();

    if (updError || !updated) {
      await recordReview(db, intent, sub.id, "assinatura mudou durante a troca", meta);
      return { applied: false, reason: updError?.message ?? "assinatura mudou durante a troca" };
    }
    subscriptionId = sub.id;
  } else {
    const { data: created, error: insError } = await db
      .from("subscriptions")
      .insert({
        company_id: intent.company_id,
        plan_id: plan.id,
        plan_price_version_id: intent.plan_price_version_id,
        billing_model: plan.billing_model,
        status: "active",
        activated_at: nowIso,
        billing_anchor_day: now.getUTCDate(),
        payment_provider: "infinitypay",
      })
      .select("id")
      .maybeSingle();
    if (insError || !created) {
      await recordReview(db, intent, null, "assinatura não pôde ser criada", meta);
      return { applied: false, reason: insError?.message ?? "assinatura não criada" };
    }
    subscriptionId = (created as { id: string }).id;
  }

  // 4. Primeiro ciclo do plano novo, a partir de agora. 1 ou 12 meses: quem
  // decide é a versão de preço (open_billing_cycle lê a duração dela).
  const { data: cycleId, error: cycleError } = await db.rpc("open_billing_cycle", {
    p_subscription_id: subscriptionId,
    p_cycle_start: nowIso,
    p_cycle_type: "usage",
    p_cents_policy: POLITICA_CENTS_VIGENTE.versao,
  });
  if (cycleError) {
    console.error(`[premium] assinatura ${subscriptionId} ativa mas ciclo não abriu:`, cycleError);
  }

  // 5. Recursos Premium liberados na ficha da loja.
  try {
    await deps.updateCompany(intent.company_id, {
      plan_type: COMPANY_PLAN_TYPE[target],
      billing_model: COMPANY_BILLING_MODEL[target],
      subscription_status: "active",
    });
  } catch (err) {
    // A cobrança já está certa; a liberação das telas fica para a equipe.
    console.error(`[premium] ${String(err)}`);
    await recordReview(db, intent, subscriptionId, "recursos Premium não liberados na loja", meta);
  }

  await db.from("subscription_events").insert({
    subscription_id: subscriptionId,
    company_id: intent.company_id,
    event_type: "premium_purchased",
    previous_status: sub?.status ?? null,
    new_status: "active",
    performed_by: intent.created_by,
    reason: `Contratação do ${target === "premium_anual" ? "Premium Anual" : "Premium Mensal"} paga pela InfinityPay (confirmada direto com a InfinityPay)`,
    metadata: {
      checkout_intent_id: intent.id,
      previous_plan_code: previousPlanCode,
      new_plan_code: target,
      plan_price_version_id: intent.plan_price_version_id,
      expected_amount_cents: intent.expected_amount_cents,
      paid_amount_cents: meta.paidAmountCents,
      transaction_nsu: meta.transactionNsu,
      capture_method: meta.captureMethod,
      opened_cycle_id: (cycleId as string | null) ?? null,
      provider_confirmed: true,
      // Consentimento: foi o próprio cliente quem iniciou e pagou.
      initiated_by_customer: true,
    },
  });

  await db
    .from("checkout_intents")
    .update({ activation_note: "aplicado", updated_at: nowIso })
    .eq("id", intent.id);

  return { applied: true, subscriptionId, cycleId: (cycleId as string | null) ?? null };
}

/**
 * Pagamento confirmado que NÃO virou plano. Fica no histórico da loja e na
 * própria intenção, com a marca de conferência manual — a equipe decide
 * entre aplicar à mão ou devolver o dinheiro.
 */
async function recordReview(
  db: BillingDb,
  intent: PurchaseIntent,
  subscriptionId: string | null,
  why: string,
  meta: {
    transactionNsu: string | null;
    captureMethod: string | null;
    paidAmountCents: number | null;
  },
): Promise<void> {
  console.error(`[premium] pagamento ${intent.id} confirmado mas não aplicado: ${why}`);
  await db
    .from("checkout_intents")
    .update({
      activation_note: `conferir: ${why}`.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id);

  if (!subscriptionId) return;
  await db.from("subscription_events").insert({
    subscription_id: subscriptionId,
    company_id: intent.company_id,
    event_type: "premium_payment_needs_review",
    reason: `Pagamento confirmado, plano não aplicado automaticamente: ${why}`,
    metadata: {
      checkout_intent_id: intent.id,
      plan_code: intent.plan_code,
      paid_amount_cents: meta.paidAmountCents,
      transaction_nsu: meta.transactionNsu,
      requires_manual_review: true,
    },
  });
}

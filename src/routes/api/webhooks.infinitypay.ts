/**
 * Aviso de pagamento da InfinityPay.
 *
 * A InfinityPay chama este endereço quando um pagamento é aprovado. O aviso
 * em si não prova nada: a InfinityPay não documenta assinatura nem segredo
 * nele, e qualquer um que descubra esta URL pode mandar um POST parecido.
 *
 * Por isso este endpoint nunca ativa uma assinatura só porque o aviso disse
 * "pago". Ao recebê-lo, ele liga de volta para a própria InfinityPay
 * (`checkInfinityPayPayment`, a "Reconferência"/Double Check que a InfinityPay
 * recomenda) e só ativa se essa segunda chamada confirmar o pagamento e o
 * valor. O aviso é só o gatilho; quem confirma é a reconferência.
 *
 * Dois fluxos diferentes chegam aqui, distinguidos pelo prefixo do
 * `order_nsu` que nós mesmos escolhemos na hora de criar o link:
 *   - sem prefixo → pagamento do checkout de cadastro (checkout_intents);
 *   - "invoice:"  → pagamento de uma fatura de ciclo mensal (payment_transactions).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb, type BillingDb } from "@/lib/billing/supabaseBridge";
import { checkInfinityPayPayment } from "@/lib/billing/infinitypay/api";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { validateGatewayConfirmation, validateIntentForReturn } from "@/lib/billing/checkout";
import { openFirstCycle } from "@/lib/billing/activateSubscription.server";
import { pizzeriaAccessStatusFor } from "@/lib/billing/collections";
import { jsonResponse } from "@/lib/server/http";

const INVOICE_PREFIX = "invoice:";

const json = (body: unknown, status = 200) => jsonResponse(body, { status });

/** Lê o primeiro campo presente, texto ou número, como string. */
function firstAsString(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

type IntentRow = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  plan_code: string;
  status: string;
  expires_at: string;
  expected_amount_cents: number;
};

/** Confirmação do checkout de cadastro — fluxo original, inalterado. */
async function handleSignupCheckout(
  db: BillingDb,
  orderNsu: string,
  transactionNsu: string | undefined,
  slug: string | undefined,
): Promise<Response> {
  const { data: found, error } = await db
    .from("checkout_intents")
    .select("id, company_id, subscription_id, plan_code, status, expires_at, expected_amount_cents")
    .eq("id", orderNsu)
    .maybeSingle();

  if (error || !found) {
    console.warn(`[infinitypay-webhook] intenção ${orderNsu} não encontrada.`);
    return json({ success: false, message: "pedido não encontrado" }, 400);
  }

  const intent = found as unknown as IntentRow;

  // Reaviso de um pagamento já processado: responder sucesso encerra a
  // repetição da InfinityPay sem reprocessar nada.
  if (intent.status === "confirmed") {
    return json({ success: true, message: null }, 200);
  }

  // Reusa a mesma régua do retorno por link: recusa intenção cancelada
  // ou vencida antes de gastar uma chamada de reconferência.
  const verdict = validateIntentForReturn(
    { planCode: intent.plan_code, status: intent.status, expiresAt: intent.expires_at },
    intent.plan_code,
  );
  if (!verdict.ok) {
    console.warn(`[infinitypay-webhook] intenção ${orderNsu} recusada: ${verdict.code}`);
    return json({ success: false, message: verdict.message }, 400);
  }

  const check = await checkInfinityPayPayment({ orderNsu, transactionNsu, slug });
  if (!check.ok) {
    console.error(`[infinitypay-webhook] reconferência falhou para ${orderNsu}: ${check.error}`);
    return json({ success: false, message: "não foi possível reconferir o pagamento" }, 400);
  }

  const confirmation = validateGatewayConfirmation(
    { paid: check.paid, paidAmountCents: check.paidAmountCents },
    intent.expected_amount_cents,
  );
  if (!confirmation.ok) {
    console.warn(
      `[infinitypay-webhook] reconferência não confirma pagamento de ${orderNsu}: ${confirmation.code}`,
    );
    return json({ success: false, message: confirmation.message }, 400);
  }

  const nowIso = new Date().toISOString();

  // Condicional ao status atual: se duas chamadas chegarem juntas, só a
  // primeira reivindica a intenção.
  const { data: claimed } = await db
    .from("checkout_intents")
    .update({ status: "confirmed", returned_at: nowIso, confirmed_at: nowIso, updated_at: nowIso })
    .eq("id", intent.id)
    .eq("status", intent.status)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return json({ success: true, message: null }, 200);
  }

  if (intent.subscription_id) {
    await db
      .from("subscriptions")
      .update({
        status: "active",
        activated_at: nowIso,
        billing_anchor_day: new Date(nowIso).getUTCDate(),
        payment_provider: "infinitypay",
        updated_at: nowIso,
      })
      .eq("id", intent.subscription_id);

    await db.from("subscription_events").insert({
      subscription_id: intent.subscription_id,
      company_id: intent.company_id,
      event_type: "checkout_return_activated",
      new_status: "active",
      reason: "Pagamento confirmado pela InfinityPay (aviso + reconferência)",
      metadata: {
        plan_code: intent.plan_code,
        checkout_intent_id: intent.id,
        transaction_nsu: transactionNsu ?? null,
        capture_method: check.captureMethod,
        provider_confirmed: true,
      },
    });

    // Sem isso, o gatilho que conta pedidos no banco nunca teria onde
    // lançar o consumo — a conta ficaria ativa e recebendo pedidos sem
    // nunca ser cobrada por eles.
    await openFirstCycle(db, intent.subscription_id);
  }

  await supabaseAdmin
    .from("pizzerias")
    .update({ subscription_status: "active" })
    .eq("id", intent.company_id);

  // Onboarding concluído de verdade: pagamento confirmado pela própria
  // InfinityPay. Este é o momento de o cardápio nascer.
  await provisionAndForget(intent.company_id);

  return json({ success: true, message: null }, 200);
}

type PaymentTransactionRow = {
  id: string;
  invoice_id: string;
  status: string;
  amount_cents: number;
};

type InvoiceRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  status: string;
};

/** Confirmação de uma fatura de ciclo mensal. */
async function handleInvoicePayment(
  db: BillingDb,
  paymentTransactionId: string,
  fullOrderNsu: string,
  transactionNsu: string | undefined,
  slug: string | undefined,
): Promise<Response> {
  const { data: txFound, error: txError } = await db
    .from("payment_transactions")
    .select("id, invoice_id, status, amount_cents")
    .eq("id", paymentTransactionId)
    .maybeSingle();

  if (txError || !txFound) {
    console.warn(`[infinitypay-webhook] cobrança ${paymentTransactionId} não encontrada.`);
    return json({ success: false, message: "pedido não encontrado" }, 400);
  }

  const tx = txFound as unknown as PaymentTransactionRow;

  if (tx.status === "paid") {
    return json({ success: true, message: null }, 200);
  }

  const check = await checkInfinityPayPayment({ orderNsu: fullOrderNsu, transactionNsu, slug });
  if (!check.ok) {
    console.error(
      `[infinitypay-webhook] reconferência falhou para ${fullOrderNsu}: ${check.error}`,
    );
    return json({ success: false, message: "não foi possível reconferir o pagamento" }, 400);
  }

  const confirmation = validateGatewayConfirmation(
    { paid: check.paid, paidAmountCents: check.paidAmountCents },
    tx.amount_cents,
  );
  if (!confirmation.ok) {
    console.warn(
      `[infinitypay-webhook] reconferência não confirma pagamento de ${fullOrderNsu}: ${confirmation.code}`,
    );
    return json({ success: false, message: confirmation.message }, 400);
  }

  const nowIso = new Date().toISOString();

  // Condicional ao status atual: se o aviso chegar duplicado, só a primeira
  // chamada reivindica a cobrança.
  const { data: claimed } = await db
    .from("payment_transactions")
    .update({
      status: "paid",
      paid_at: nowIso,
      external_transaction_id: transactionNsu ?? null,
      raw_provider_status: {
        capture_method: check.captureMethod,
        transaction_nsu: transactionNsu ?? null,
      },
      updated_at: nowIso,
    })
    .eq("id", tx.id)
    .eq("status", tx.status)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return json({ success: true, message: null }, 200);
  }

  const { data: invoiceFound } = await db
    .from("invoices")
    .select("id, subscription_id, company_id, status")
    .eq("id", tx.invoice_id)
    .maybeSingle();
  const invoice = invoiceFound as unknown as InvoiceRow | null;

  if (invoice) {
    await db
      .from("invoices")
      .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
      .eq("id", invoice.id);

    const { data: subFound } = await db
      .from("subscriptions")
      .select("id, status")
      .eq("id", invoice.subscription_id)
      .maybeSingle();
    const subscription = subFound as { id: string; status: string } | null;

    if (subscription) {
      // Pagamento em dia libera de qualquer atraso — inclusive de uma
      // suspensão que já tinha acontecido por falta de pagamento.
      await db
        .from("subscriptions")
        .update({ status: "active", updated_at: nowIso })
        .eq("id", subscription.id);

      await supabaseAdmin
        .from("pizzerias")
        .update({ subscription_status: pizzeriaAccessStatusFor("active") })
        .eq("id", invoice.company_id);

      await db.from("subscription_events").insert({
        subscription_id: subscription.id,
        company_id: invoice.company_id,
        event_type: "invoice_paid",
        previous_status: subscription.status,
        new_status: "active",
        reason: "Fatura do ciclo paga pela InfinityPay (aviso + reconferência)",
        metadata: {
          invoice_id: invoice.id,
          payment_transaction_id: tx.id,
          transaction_nsu: transactionNsu ?? null,
          capture_method: check.captureMethod,
          provider_confirmed: true,
        },
      });
    }
  }

  return json({ success: true, message: null }, 200);
}

export const Route = createFileRoute("/api/webhooks/infinitypay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown> | null;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ success: false, message: "corpo inválido" }, 400);
        }

        const orderNsu = firstAsString(payload, "order_nsu", "orderNsu");
        const transactionNsu = firstAsString(payload, "transaction_nsu", "transactionNsu");
        const slug = firstAsString(payload, "invoice_slug", "slug");

        if (!orderNsu) {
          console.warn("[infinitypay-webhook] aviso sem order_nsu, ignorado.");
          return json({ success: false, message: "order_nsu ausente" }, 400);
        }

        const db = asBillingDb(supabaseAdmin);

        if (orderNsu.startsWith(INVOICE_PREFIX)) {
          const paymentTransactionId = orderNsu.slice(INVOICE_PREFIX.length);
          return handleInvoicePayment(db, paymentTransactionId, orderNsu, transactionNsu, slug);
        }

        return handleSignupCheckout(db, orderNsu, transactionNsu, slug);
      },
    },
  },
});

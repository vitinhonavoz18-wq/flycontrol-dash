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
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { checkInfinityPayPayment } from "@/lib/billing/infinitypay/api";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { validateGatewayConfirmation, validateIntentForReturn } from "@/lib/billing/checkout";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type IntentRow = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  plan_code: string;
  status: string;
  expires_at: string;
  expected_amount_cents: number;
};

/** Lê o primeiro campo presente, texto ou número, como string. */
function firstAsString(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
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
        const { data: found, error } = await db
          .from("checkout_intents")
          .select(
            "id, company_id, subscription_id, plan_code, status, expires_at, expected_amount_cents",
          )
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
          console.error(
            `[infinitypay-webhook] reconferência falhou para ${orderNsu}: ${check.error}`,
          );
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
          .update({
            status: "confirmed",
            returned_at: nowIso,
            confirmed_at: nowIso,
            updated_at: nowIso,
          })
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
        }

        await supabaseAdmin
          .from("pizzerias")
          .update({ subscription_status: "active" })
          .eq("id", intent.company_id);

        // Onboarding concluído de verdade: pagamento confirmado pela própria
        // InfinityPay. Este é o momento de o cardápio nascer.
        await provisionAndForget(intent.company_id);

        return json({ success: true, message: null }, 200);
      },
    },
  },
});

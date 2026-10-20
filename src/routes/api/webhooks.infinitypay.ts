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
 *   - sem prefixo → contratação (checkout_intents): cadastro pago ou
 *     Premium Mensal/Anual contratado de dentro do painel;
 *   - "invoice:"  → pagamento de uma fatura de ciclo mensal (payment_transactions).
 */

import { createFileRoute } from "@tanstack/react-router";
import { verifyAndConfirmCheckoutIntent } from "@/lib/billing/intentPayment.server";
import {
  INVOICE_ORDER_PREFIX,
  verifyAndConfirmInvoicePayment,
} from "@/lib/billing/invoicePayment.server";

const INVOICE_PREFIX = INVOICE_ORDER_PREFIX;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Lê o primeiro campo presente, texto ou número, como string. */
function firstAsString(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

/**
 * Confirmação de uma contratação: cadastro pago ou Premium contratado pelo
 * painel. A regra inteira (reconferência, valor, uso único, ativação) mora em
 * `verifyAndConfirmCheckoutIntent` — a mesma que o retorno do cliente e o
 * robô diário usam.
 */
async function handleCheckoutIntent(
  orderNsu: string,
  transactionNsu: string | undefined,
  slug: string | undefined,
): Promise<Response> {
  const outcome = await verifyAndConfirmCheckoutIntent({
    intentId: orderNsu,
    transactionNsu,
    slug,
  });

  if (outcome.ok) return json({ success: true, message: null }, 200);

  if (outcome.reason === "not_found") {
    console.warn(`[infinitypay-webhook] intenção ${orderNsu} não encontrada.`);
    return json({ success: false, message: "pedido não encontrado" }, 400);
  }
  if (outcome.reason === "check_failed") {
    console.error(
      `[infinitypay-webhook] reconferência falhou para ${orderNsu}: ${outcome.message}`,
    );
    return json({ success: false, message: "não foi possível reconferir o pagamento" }, 400);
  }
  console.warn(
    `[infinitypay-webhook] intenção ${orderNsu} não confirmada (${outcome.reason}): ${outcome.message}`,
  );
  return json({ success: false, message: outcome.message }, 400);
}

/** Confirmação de uma fatura de ciclo mensal. */
async function handleInvoicePayment(
  paymentTransactionId: string,
  transactionNsu: string | undefined,
  slug: string | undefined,
): Promise<Response> {
  const outcome = await verifyAndConfirmInvoicePayment({
    paymentTransactionId,
    transactionNsu,
    slug,
  });

  if (outcome.ok) return json({ success: true, message: null }, 200);

  if (outcome.reason === "not_found") {
    console.warn(`[infinitypay-webhook] cobrança ${paymentTransactionId} não encontrada.`);
    return json({ success: false, message: "pedido não encontrado" }, 400);
  }
  if (outcome.reason === "check_failed") {
    console.error(
      `[infinitypay-webhook] reconferência falhou para ${paymentTransactionId}: ${outcome.message}`,
    );
    return json({ success: false, message: "não foi possível reconferir o pagamento" }, 400);
  }
  console.warn(
    `[infinitypay-webhook] reconferência não confirma pagamento de ${paymentTransactionId}: ${outcome.message}`,
  );
  return json({ success: false, message: outcome.message }, 400);
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

        if (orderNsu.startsWith(INVOICE_PREFIX)) {
          const paymentTransactionId = orderNsu.slice(INVOICE_PREFIX.length);
          return handleInvoicePayment(paymentTransactionId, transactionNsu, slug);
        }

        // order_nsu das contratações é o id (UUID) da intenção. Qualquer outra
        // coisa nem chega ao banco.
        if (!UUID.test(orderNsu)) {
          return json({ success: false, message: "pedido não encontrado" }, 400);
        }
        return handleCheckoutIntent(orderNsu, transactionNsu, slug);
      },
    },
  },
});

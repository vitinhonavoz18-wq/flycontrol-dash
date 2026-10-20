/**
 * Confirmação do pagamento de uma fatura mensal. Servidor apenas.
 *
 * Três caminhos chegam aqui, e os três terminam no MESMO lugar:
 *   - o aviso da InfinityPay (webhook);
 *   - o cliente voltando da InfinityPay para a tela de cobrança;
 *   - o robô diário, que reconfere cobranças cujo aviso pode ter se perdido.
 *
 * Nenhum deles confia no que ouviu: todos ligam de volta para a InfinityPay
 * (`checkInfinityPayPayment`) e só dão baixa se ela confirmar pagamento e
 * valor. É conferir o extrato do banco, e não o print que o cliente mandou.
 *
 * Pagou → a fatura fica paga, a loja volta a funcionar e o ciclo se renova:
 * se não houver um mês aberto contando pedidos, um novo abre na hora.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb, type BillingDb } from "./supabaseBridge";
import { checkInfinityPayPayment } from "./infinitypay/api";
import { validateGatewayConfirmation } from "./checkout";
import { POLITICA_CENTS_VIGENTE } from "./centsTiers";
import {
  OPEN_INVOICE_STATUSES,
  pizzeriaAccessStatusFor,
  statusAfterInvoicePaid,
} from "./collections";

/** Prefixo do `order_nsu` das cobranças de fatura (o cadastro não tem). */
export const INVOICE_ORDER_PREFIX = "invoice:";

export type InvoicePaymentOutcome =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; reason: "not_found" | "check_failed" | "not_confirmed"; message: string };

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

/**
 * Reconfere com a InfinityPay a cobrança `paymentTransactionId` e, se ela
 * confirmar, dá baixa na fatura. Pode ser chamada quantas vezes for: a
 * segunda chamada encontra a cobrança já paga e não faz nada.
 */
export async function verifyAndConfirmInvoicePayment(
  input: { paymentTransactionId: string; transactionNsu?: string | null; slug?: string | null },
  db: BillingDb = asBillingDb(supabaseAdmin),
): Promise<InvoicePaymentOutcome> {
  const { data: txFound, error: txError } = await db
    .from("payment_transactions")
    .select("id, invoice_id, status, amount_cents")
    .eq("id", input.paymentTransactionId)
    .maybeSingle();

  if (txError || !txFound) {
    return { ok: false, reason: "not_found", message: "cobrança não encontrada" };
  }
  const tx = txFound as PaymentTransactionRow;

  if (tx.status === "paid") return { ok: true, alreadyPaid: true };

  const orderNsu = `${INVOICE_ORDER_PREFIX}${tx.id}`;
  const check = await checkInfinityPayPayment({
    orderNsu,
    transactionNsu: input.transactionNsu ?? null,
    slug: input.slug ?? null,
  });
  if (!check.ok) {
    return { ok: false, reason: "check_failed", message: check.error };
  }

  const confirmation = validateGatewayConfirmation(
    { paid: check.paid, paidAmountCents: check.paidAmountCents },
    tx.amount_cents,
  );
  if (!confirmation.ok) {
    return { ok: false, reason: "not_confirmed", message: confirmation.message };
  }

  const nowIso = new Date().toISOString();

  // Condicional ao status lido: aviso e robô chegando juntos, só um dá baixa.
  const { data: claimed } = await db
    .from("payment_transactions")
    .update({
      status: "paid",
      paid_at: nowIso,
      external_transaction_id: input.transactionNsu ?? null,
      raw_provider_status: {
        capture_method: check.captureMethod,
        transaction_nsu: input.transactionNsu ?? null,
      },
      updated_at: nowIso,
    })
    .eq("id", tx.id)
    .eq("status", tx.status)
    .select("id")
    .maybeSingle();

  if (!claimed) return { ok: true, alreadyPaid: true };

  await markInvoicePaidAndRenew(db, tx, {
    transactionNsu: input.transactionNsu ?? null,
    captureMethod: check.captureMethod,
  });

  return { ok: true, alreadyPaid: false };
}

/**
 * Baixa da fatura + liberação da loja + renovação do ciclo.
 *
 * Só roda depois que a cobrança foi reivindicada como paga — nunca duas vezes
 * para o mesmo pagamento.
 */
async function markInvoicePaidAndRenew(
  db: BillingDb,
  tx: PaymentTransactionRow,
  meta: { transactionNsu: string | null; captureMethod: string | null },
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: invoiceFound } = await db
    .from("invoices")
    .select("id, subscription_id, company_id, status")
    .eq("id", tx.invoice_id)
    .maybeSingle();
  const invoice = invoiceFound as InvoiceRow | null;
  if (!invoice) {
    console.error(`[billing] cobrança ${tx.id} paga, mas a fatura ${tx.invoice_id} sumiu.`);
    return;
  }

  // Fatura CANCELADA não vira paga, e nada se renova por causa dela.
  //
  // Foi assim que a cobrança da ADEGA foi pausada: o ciclo e a fatura foram
  // cancelados. Se um link antigo dessa fatura ainda circular e alguém pagar,
  // dar baixa aqui reabriria um ciclo que o dono mandou parar — é o caixa
  // aceitando o pagamento de uma comanda que já foi rasgada e, por causa
  // dele, reabrindo a mesa. O dinheiro fica registrado (a cobrança está
  // marcada como paga acima) e o caso vai para o histórico, para a equipe
  // decidir entre devolver ou abater.
  if (invoice.status === "canceled") {
    console.error(
      `[billing] cobrança ${tx.id} paga, mas a fatura ${invoice.id} está CANCELADA — ` +
        "nada foi renovado. Conferir devolução/abatimento.",
    );
    await db.from("subscription_events").insert({
      subscription_id: invoice.subscription_id,
      company_id: invoice.company_id,
      event_type: "payment_on_canceled_invoice",
      reason: "Pagamento confirmado pela InfinityPay para uma fatura cancelada; requer conferência",
      metadata: {
        invoice_id: invoice.id,
        payment_transaction_id: tx.id,
        amount_cents: tx.amount_cents,
        transaction_nsu: meta.transactionNsu,
        capture_method: meta.captureMethod,
        provider_confirmed: true,
        requires_manual_review: true,
      },
    });
    return;
  }

  // Vale também para fatura "overdue": quem pagou atrasado pagou. A condição
  // de status impede que uma fatura cancelada entre um instante e outro seja
  // marcada como paga.
  await db
    .from("invoices")
    .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
    .eq("id", invoice.id)
    .neq("status", "canceled");

  const { data: subFound } = await db
    .from("subscriptions")
    .select("id, status")
    .eq("id", invoice.subscription_id)
    .maybeSingle();
  const subscription = subFound as { id: string; status: string } | null;
  if (!subscription) return;

  // Assinatura cancelada continua cancelada: pagar uma conta antiga quita a
  // dívida, não reabre o contrato.
  if (subscription.status === "canceled") return;

  // Ainda existe OUTRA fatura atrasada? Então a loja não volta 100% só por
  // esta (ver statusAfterInvoicePaid).
  const { data: othersRaw } = await db
    .from("invoices")
    .select("id, status, due_at")
    .eq("subscription_id", subscription.id)
    .in("status", OPEN_INVOICE_STATUSES)
    .neq("id", invoice.id);
  const others = ((othersRaw ?? []) as Array<{ status: string; due_at: string | null }>).map(
    (o) => ({ status: o.status, dueAt: o.due_at ? new Date(o.due_at) : now }),
  );
  const newStatus = statusAfterInvoicePaid(others, now);

  const update: Record<string, unknown> = { status: newStatus, updated_at: nowIso };
  if (newStatus !== "suspended") update.suspended_at = null;
  await db.from("subscriptions").update(update).eq("id", subscription.id);

  await supabaseAdmin
    .from("pizzerias")
    .update({ subscription_status: pizzeriaAccessStatusFor(newStatus) })
    .eq("id", invoice.company_id);

  // O ciclo se renova. Normalmente o mês seguinte já abriu no fechamento,
  // e esta chamada só devolve o que já existe. Mas se a loja estava
  // suspensa quando o mês virou, nenhum mês novo abriu — e sem mês aberto os
  // pedidos não teriam onde ser anotados. O abridor não duplica: se já há um
  // aberto, devolve ele.
  let renewedCycleId: string | null = null;
  if (newStatus !== "suspended") {
    const { data: cycleId, error: cycleError } = await db.rpc("open_billing_cycle", {
      p_subscription_id: subscription.id,
      p_cycle_start: nowIso,
      p_cycle_type: "usage",
      p_cents_policy: POLITICA_CENTS_VIGENTE.versao,
    });
    if (cycleError) {
      console.error(
        `[billing] fatura ${invoice.id} paga, mas o ciclo não renovou: ${cycleError.message}`,
      );
    }
    renewedCycleId = (cycleId as string | null) ?? null;
  }

  await db.from("subscription_events").insert({
    subscription_id: subscription.id,
    company_id: invoice.company_id,
    event_type: "invoice_paid",
    previous_status: subscription.status,
    new_status: newStatus,
    reason: "Fatura do ciclo paga pela InfinityPay (confirmada direto com a InfinityPay)",
    metadata: {
      invoice_id: invoice.id,
      payment_transaction_id: tx.id,
      transaction_nsu: meta.transactionNsu,
      capture_method: meta.captureMethod,
      provider_confirmed: true,
      open_cycle_id: renewedCycleId,
    },
  });
}

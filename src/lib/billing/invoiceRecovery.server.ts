/**
 * Rede de segurança da cobrança mensal. Servidor apenas — roda no robô
 * diário, ANTES da régua de atraso e suspensão.
 *
 * Cobre as duas falhas que, sem isto, suspenderiam um cliente injustamente:
 *
 * 1. O link de pagamento não foi criado (a InfinityPay estava fora do ar no
 *    dia em que o mês fechou). A fatura ficava sem botão de pagar para
 *    sempre. Aqui o link é criado de novo.
 *
 * 2. O cliente pagou, mas o aviso da InfinityPay se perdeu no caminho. A
 *    fatura continuava "pendente" e a loja seria suspensa com a conta paga.
 *    Aqui cada cobrança em aberto é reconferida direto com a InfinityPay.
 *
 * Ordem importa: reconferir antes de suspender. Quem pagou não pode ser
 * cortado por causa de um recado que não chegou.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";
import { OPEN_INVOICE_STATUSES } from "./collections";
import { createRecurringCharge } from "./infinitypay/recurringCharge.server";
import { verifyAndConfirmInvoicePayment } from "./invoicePayment.server";

export type RecoveryResult = {
  openInvoices: number;
  linksCreated: number;
  linksFailed: number;
  paymentsChecked: number;
  paymentsConfirmed: number;
  errors: string[];
};

/**
 * Cobrança recém-criada ainda não teve tempo de ser paga — e o aviso normal
 * costuma chegar em segundos. Só reconferimos o que já passou disso.
 */
const MIN_AGE_BEFORE_RECHECK_MS = 10 * 60 * 1000;

export async function recoverInvoiceCharges(): Promise<RecoveryResult> {
  const db = asBillingDb(supabaseAdmin);
  const result: RecoveryResult = {
    openInvoices: 0,
    linksCreated: 0,
    linksFailed: 0,
    paymentsChecked: 0,
    paymentsConfirmed: 0,
    errors: [],
  };

  const { data: invoicesRaw, error } = await db
    .from("invoices")
    .select("id, total_cents")
    .in("status", OPEN_INVOICE_STATUSES)
    .gt("total_cents", 0);

  if (error) {
    result.errors.push(`Falha ao listar faturas em aberto: ${error.message}`);
    return result;
  }

  const invoices = (invoicesRaw ?? []) as Array<{ id: string; total_cents: number }>;
  result.openInvoices = invoices.length;
  if (invoices.length === 0) return result;

  const { data: txRaw, error: txError } = await db
    .from("payment_transactions")
    .select("id, invoice_id, created_at")
    .in(
      "invoice_id",
      invoices.map((i) => i.id),
    )
    .eq("status", "pending");

  if (txError) {
    result.errors.push(`Falha ao listar cobranças em aberto: ${txError.message}`);
    return result;
  }

  const pendingTx = (txRaw ?? []) as Array<{ id: string; invoice_id: string; created_at: string }>;
  const invoicesWithLink = new Set(pendingTx.map((t) => t.invoice_id));

  // 1. Pagamentos cujo aviso pode ter se perdido.
  const cutoff = Date.now() - MIN_AGE_BEFORE_RECHECK_MS;
  for (const tx of pendingTx) {
    if (new Date(tx.created_at).getTime() > cutoff) continue;
    result.paymentsChecked++;
    try {
      const outcome = await verifyAndConfirmInvoicePayment({ paymentTransactionId: tx.id }, db);
      if (outcome.ok && !outcome.alreadyPaid) result.paymentsConfirmed++;
      // "não pago" é o normal de quem ainda não pagou — não é erro.
      if (!outcome.ok && outcome.reason === "check_failed") {
        result.errors.push(`Cobrança ${tx.id}: reconferência falhou (${outcome.message})`);
      }
    } catch (err) {
      result.errors.push(`Cobrança ${tx.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Faturas que ficaram sem link de pagamento.
  for (const invoice of invoices) {
    if (invoicesWithLink.has(invoice.id)) continue;
    try {
      const charge = await createRecurringCharge(invoice.id);
      if (charge.ok) result.linksCreated++;
      else {
        result.linksFailed++;
        result.errors.push(`Fatura ${invoice.id}: link não criado (${charge.reason})`);
      }
    } catch (err) {
      result.linksFailed++;
      result.errors.push(
        `Fatura ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

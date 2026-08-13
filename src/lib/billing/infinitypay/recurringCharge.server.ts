/**
 * Cobrança automática de uma fatura de ciclo fechado.
 *
 * Gera um link de pagamento novo, específico desta fatura, com o aviso de
 * pagamento apontando para o mesmo endpoint que já confirma o cadastro — a
 * diferença é só o prefixo do `order_nsu` ("invoice:"), que diz ao aviso
 * qual dos dois fluxos ele está confirmando (ver webhooks.infinitypay.ts).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "../supabaseBridge";
import { createInfinityPayCheckoutLink, infinityPayHandle } from "./api";

export type RecurringChargeResult =
  { ok: true; paymentTransactionId: string; checkoutUrl: string } | { ok: false; reason: string };

type InvoiceRow = {
  id: string;
  company_id: string;
  total_cents: number;
  invoice_number: string;
  status: string;
};

export async function createRecurringCharge(invoiceId: string): Promise<RecurringChargeResult> {
  const db = asBillingDb(supabaseAdmin);
  const publicUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const handle = infinityPayHandle();

  if (!handle || !publicUrl) {
    return { ok: false, reason: "infinitypay_not_configured" };
  }

  const { data: invoiceRaw, error } = await db
    .from("invoices")
    .select("id, company_id, total_cents, invoice_number, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !invoiceRaw) return { ok: false, reason: "invoice_not_found" };
  const invoice = invoiceRaw as unknown as InvoiceRow;

  if (invoice.status !== "pending") return { ok: false, reason: "invoice_not_pending" };
  if (invoice.total_cents <= 0) return { ok: false, reason: "nothing_to_charge" };

  const { data: companyRaw } = await supabaseAdmin
    .from("pizzerias")
    .select("name")
    .eq("id", invoice.company_id)
    .maybeSingle();
  const companyName = (companyRaw as { name?: string } | null)?.name ?? "seu estabelecimento";

  const paymentTransactionId = crypto.randomUUID();

  const link = await createInfinityPayCheckoutLink({
    orderNsu: `invoice:${paymentTransactionId}`,
    amountCents: invoice.total_cents,
    description: `FlyControl - fatura ${invoice.invoice_number} (${companyName})`,
    redirectUrl: `${publicUrl}/billing`,
    webhookUrl: `${publicUrl}/api/webhooks/infinitypay`,
  });

  if (!link.ok) {
    console.error(`[billing] falha ao criar cobrança da fatura ${invoiceId}: ${link.error}`);
    return { ok: false, reason: link.error };
  }

  const { error: insertError } = await db.from("payment_transactions").insert({
    id: paymentTransactionId,
    invoice_id: invoiceId,
    provider: "infinitypay",
    status: "pending",
    amount_cents: invoice.total_cents,
    checkout_url: link.url,
  });

  if (insertError) {
    console.error(
      `[billing] falha ao registrar cobrança da fatura ${invoiceId}: ${insertError.message}`,
    );
    return { ok: false, reason: insertError.message };
  }

  await db
    .from("invoices")
    .update({ payment_provider: "infinitypay", updated_at: new Date().toISOString() })
    .eq("id", invoiceId);

  return { ok: true, paymentTransactionId, checkoutUrl: link.url };
}

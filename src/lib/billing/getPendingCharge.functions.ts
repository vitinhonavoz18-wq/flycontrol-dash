/**
 * Link de pagamento de uma fatura pendente. Servidor apenas.
 *
 * `payment_transactions` não tem policy de leitura para o dono da empresa —
 * são dados do gateway, só o servidor e um administrador global enxergam.
 * Esta função é o único portão: confirma, com o cliente do PRÓPRIO usuário
 * (que respeita a política de "o dono lê a própria fatura, e só"), que a
 * fatura pedida é dele, e só então busca o link com o cliente administrativo.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/authMiddleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";

export type PendingCharge = { checkoutUrl: string } | null;

export const getPendingCharge = createServerFn({ method: "GET" })
  .inputValidator((d: { invoiceId: string }) => {
    if (!d?.invoiceId) throw new Error("Fatura não informada.");
    return d;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<PendingCharge> => {
    const userDb = asBillingDb(context.supabase);

    // O RLS de `invoices` já garante que só devolve algo se a fatura for de
    // uma empresa do próprio usuário (ou ele for administrador global).
    const { data: invoiceRow } = await userDb
      .from("invoices")
      .select("id, status")
      .eq("id", data.invoiceId)
      .maybeSingle();

    if (!invoiceRow) return null;
    const invoice = invoiceRow as { id: string; status: string };
    if (invoice.status !== "pending") return null;

    const adminDb = asBillingDb(supabaseAdmin);
    const { data: txRow } = await adminDb
      .from("payment_transactions")
      .select("checkout_url, status")
      .eq("invoice_id", invoice.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .maybeSingle();

    const tx = txRow as { checkout_url: string | null } | null;
    return tx?.checkout_url ? { checkoutUrl: tx.checkout_url } : null;
  });

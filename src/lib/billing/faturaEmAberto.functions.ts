/**
 * A fatura em aberto da loja e o link para pagá-la. Servidor apenas.
 *
 * Alimenta o aviso que aparece no painel quando o mês fecha e o botão de
 * pagar da tela de cobrança.
 *
 * `payment_transactions` não tem policy de leitura para o dono da empresa —
 * são dados do gateway. Por isso o caminho é sempre o mesmo: primeiro o
 * cliente do PRÓPRIO usuário (que respeita a regra "o dono lê a própria
 * fatura, e só") confirma que a fatura é dele; só então o cliente
 * administrativo busca o link.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";
import { OPEN_INVOICE_STATUSES } from "./collections";
import { createRecurringCharge } from "./infinitypay/recurringCharge.server";
import { INVOICE_ORDER_PREFIX, verifyAndConfirmInvoicePayment } from "./invoicePayment.server";

export type FaturaEmAberto = {
  invoiceId: string;
  numero: string;
  /** "pending" (no prazo) ou "overdue" (vencida, loja suspensa). */
  status: string;
  totalCents: number;
  dueAt: string | null;
  /** Nulo quando a InfinityPay não gerou o link — a tela avisa, sem botão falso. */
  checkoutUrl: string | null;
} | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getFaturaEmAberto = createServerFn({ method: "GET" })
  .inputValidator((d: { companyId: string }) => {
    if (typeof d?.companyId !== "string" || !UUID.test(d.companyId)) {
      throw new Error("Loja não informada.");
    }
    return d;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<FaturaEmAberto> => {
    const userDb = asBillingDb(context.supabase);

    // A mais antiga primeiro: é a que está mais perto de suspender a loja.
    const { data: invoiceRow } = await userDb
      .from("invoices")
      .select("id, invoice_number, status, total_cents, due_at")
      .eq("company_id", data.companyId)
      .in("status", OPEN_INVOICE_STATUSES)
      .gt("total_cents", 0)
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!invoiceRow) return null;
    const invoice = invoiceRow as {
      id: string;
      invoice_number: string;
      status: string;
      total_cents: number;
      due_at: string | null;
    };

    const adminDb = asBillingDb(supabaseAdmin);
    const { data: txRow } = await adminDb
      .from("payment_transactions")
      .select("checkout_url")
      .eq("invoice_id", invoice.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let checkoutUrl = (txRow as { checkout_url: string | null } | null)?.checkout_url ?? null;

    // Sem link (a InfinityPay falhou no dia do fechamento)? Tenta gerar agora,
    // em vez de deixar o cliente olhando uma conta sem ter como pagar.
    if (!checkoutUrl) {
      const charge = await createRecurringCharge(invoice.id);
      if (charge.ok) checkoutUrl = charge.checkoutUrl;
      else console.error(`[fatura] sem link para a fatura ${invoice.id}: ${charge.reason}`);
    }

    return {
      invoiceId: invoice.id,
      numero: invoice.invoice_number,
      status: invoice.status,
      totalCents: Number(invoice.total_cents ?? 0),
      dueAt: invoice.due_at,
      checkoutUrl,
    };
  });

export type ConferenciaDePagamento = { pago: boolean; mensagem: string };

/**
 * Roda quando a InfinityPay devolve o cliente para a tela de cobrança. Os
 * dados que vêm no endereço (order_nsu, transaction_nsu, slug) NÃO provam
 * nada sozinhos — servem só para perguntar à InfinityPay, que é quem
 * confirma.
 */
export const conferirPagamentoDaFatura = createServerFn({ method: "POST" })
  .inputValidator((d: { orderNsu: string; transactionNsu?: string; slug?: string }) => {
    const id = typeof d?.orderNsu === "string" ? d.orderNsu.slice(INVOICE_ORDER_PREFIX.length) : "";
    if (!d?.orderNsu?.startsWith(INVOICE_ORDER_PREFIX) || !UUID.test(id)) {
      throw new Error("Retorno de pagamento inválido.");
    }
    const curto = (v: unknown) =>
      typeof v === "string" && v.length > 0 && v.length <= 200 ? v : undefined;
    return { orderNsu: d.orderNsu, transactionNsu: curto(d.transactionNsu), slug: curto(d.slug) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ConferenciaDePagamento> => {
    const paymentTransactionId = data.orderNsu.slice(INVOICE_ORDER_PREFIX.length);

    const adminDb = asBillingDb(supabaseAdmin);
    const { data: txRow } = await adminDb
      .from("payment_transactions")
      .select("invoice_id")
      .eq("id", paymentTransactionId)
      .maybeSingle();
    const invoiceId = (txRow as { invoice_id: string } | null)?.invoice_id;
    if (!invoiceId) return { pago: false, mensagem: "Cobrança não encontrada." };

    // A fatura é desta pessoa? O RLS responde: se não for, não aparece.
    const { data: own } = await asBillingDb(context.supabase)
      .from("invoices")
      .select("id")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!own) return { pago: false, mensagem: "Cobrança não encontrada." };

    const outcome = await verifyAndConfirmInvoicePayment({
      paymentTransactionId,
      transactionNsu: data.transactionNsu,
      slug: data.slug,
    });

    if (outcome.ok) return { pago: true, mensagem: "Pagamento confirmado. Obrigado!" };
    if (outcome.reason === "not_confirmed") {
      return {
        pago: false,
        mensagem:
          "A InfinityPay ainda não confirmou o pagamento. Se você pagou por Pix, aguarde alguns minutos.",
      };
    }
    return {
      pago: false,
      mensagem: "Não conseguimos conferir o pagamento agora. Ele será conferido automaticamente.",
    };
  });

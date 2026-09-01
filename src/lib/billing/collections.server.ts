/**
 * Aplica a política de cobrança (collections.ts) às faturas pendentes.
 * Servidor apenas — roda a partir do agendador diário, depois do fechamento
 * dos ciclos vencidos.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";
import {
  OVERDUE_GRACE_HOURS,
  decideCollectionsAction,
  pizzeriaAccessStatusFor,
} from "./collections";
import { fecharVitrine } from "./vitrine.server";

export type ReconcileResult = {
  checked: number;
  markedPastDue: number;
  suspended: number;
  errors: string[];
};

type InvoiceRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  due_at: string;
};

type SubscriptionRow = { id: string; status: string };

export async function reconcileOverdueInvoices(): Promise<ReconcileResult> {
  const db = asBillingDb(supabaseAdmin);
  const now = new Date();
  const result: ReconcileResult = { checked: 0, markedPastDue: 0, suspended: 0, errors: [] };

  const { data, error } = await db
    .from("invoices")
    .select("id, subscription_id, company_id, due_at")
    .eq("status", "pending")
    .lte("due_at", now.toISOString());

  if (error) {
    result.errors.push(`Falha ao listar faturas vencidas: ${error.message}`);
    return result;
  }

  const rows = (data ?? []) as InvoiceRow[];
  result.checked = rows.length;

  for (const invoice of rows) {
    try {
      const { data: subRaw } = await db
        .from("subscriptions")
        .select("id, status")
        .eq("id", invoice.subscription_id)
        .maybeSingle();
      const sub = subRaw as SubscriptionRow | null;
      if (!sub) continue;

      const action = decideCollectionsAction({
        dueAt: new Date(invoice.due_at),
        now,
        subscriptionStatus: sub.status,
      });
      if (action === "none") continue;

      const targetStatus = action === "suspend" ? "suspended" : "past_due";
      const nowIso = now.toISOString();

      const update: Record<string, unknown> = { status: targetStatus, updated_at: nowIso };
      if (action === "suspend") update.suspended_at = nowIso;

      // Condicional ao status lido: se outro processo já mudou a assinatura
      // no meio deste laço, esta gravação não sobrescreve o que ele fez.
      const { data: updated } = await db
        .from("subscriptions")
        .update(update)
        .eq("id", sub.id)
        .eq("status", sub.status)
        .select("id");

      if (!updated || (updated as unknown[]).length === 0) continue;

      // O reflexo no campo que a porta de acesso confere de verdade — sem
      // isso, "suspender" a assinatura não bloqueia nada na prática.
      await supabaseAdmin
        .from("pizzerias")
        .update({ subscription_status: pizzeriaAccessStatusFor(targetStatus) })
        .eq("id", invoice.company_id);

      // Fechar o painel não fecha a vitrine: o cardápio digital é servido pelo
      // SiteCreatorFly, que tem banco próprio e só sabe o que a gente conta.
      // Sem este aviso, o cliente final continuaria vendo a loja aberta e
      // montando um pedido que o /api/orders recusaria só no final — a pior
      // experiência possível, a de descobrir no caixa que a loja estava fechada.
      if (action === "suspend") {
        const fechada = await fecharVitrine(invoice.company_id);
        if (!fechada.ok) {
          // Não interrompe a suspensão: o pedido já está barrado no
          // /api/orders de qualquer jeito. Isto é aviso, não bloqueio.
          result.errors.push(
            `Loja ${invoice.company_id} suspensa, mas a vitrine não fechou: ${fechada.erro}`,
          );
        }

        await db
          .from("invoices")
          .update({ status: "overdue", updated_at: nowIso })
          .eq("id", invoice.id);
      }

      await db.from("subscription_events").insert({
        subscription_id: sub.id,
        company_id: invoice.company_id,
        event_type: action === "suspend" ? "suspended_for_nonpayment" : "marked_past_due",
        previous_status: sub.status,
        new_status: targetStatus,
        reason:
          action === "suspend"
            ? `Fatura vencida há mais de ${OVERDUE_GRACE_HOURS} horas sem pagamento.`
            : "Fatura vencida, dentro do prazo de tolerância.",
        metadata: { invoice_id: invoice.id, due_at: invoice.due_at },
      });

      if (action === "suspend") result.suspended++;
      else result.markedPastDue++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Fatura ${invoice.id}: ${message}`);
    }
  }

  return result;
}

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

/**
 * Avisa o SiteCreatorFly que a loja parou de atender.
 *
 * O cardápio digital do cliente final NÃO é servido por este sistema: ele mora
 * no SiteCreatorFly, que tem banco de dados próprio. Os dois conversam pelo
 * endpoint de sincronização — o mesmo caminho que já leva mudança de preço e
 * de horário.
 *
 * `is_open: false` é o sinal que aquele lado entende como "não está atendendo".
 * É o mesmo botão de "fechar a loja" que o lojista já usa quando fecha mais
 * cedo, só que acionado pela cobrança em vez de pela mão dele.
 *
 * Reabre sozinho: quando o pagamento é confirmado e a assinatura volta a
 * `active`, a sincronização seguinte manda o `is_open` verdadeiro da loja.
 */
async function fecharVitrine(companyId: string): Promise<{ ok: boolean; erro?: string }> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("slug, api_key, sync_endpoint, sf_restaurant_id, name")
    .eq("id", companyId)
    .maybeSingle();

  const loja = data as {
    slug: string | null;
    api_key: string | null;
    sync_endpoint: string | null;
    sf_restaurant_id: string | null;
    name: string | null;
  } | null;

  // Loja que nunca foi provisionada no SiteCreatorFly não tem vitrine para
  // fechar. Não é erro: é o caso de quem só usa o painel.
  if (!loja?.sync_endpoint || !loja.sf_restaurant_id) return { ok: true };

  const { syncToExternal } = await import("@/utils/menuSync");
  const r = await syncToExternal({
    type: "restaurant",
    action: "update",
    externalId: loja.sf_restaurant_id,
    data: { name: loja.name, is_open: false },
    pizzeriaSlug: loja.slug ?? "",
    pizzeriaApiKey: loja.api_key ?? "",
    syncEndpoint: loja.sync_endpoint,
  });

  return r.success ? { ok: true } : { ok: false, erro: r.error ?? "erro desconhecido" };
}

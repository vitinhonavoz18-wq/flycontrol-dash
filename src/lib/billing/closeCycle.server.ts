/**
 * Fechamento de ciclo. Servidor apenas.
 *
 * Divisão de responsabilidades com o trigger em SQL:
 * - o trigger CONTA (precisa estar no banco para nenhum caminho de escrita
 *   escapar);
 * - este módulo faz a MATEMÁTICA do dinheiro, usando o mesmo motor puro que
 *   a interface usa para estimar.
 *
 * A regra de preço vive num lugar só: `calculateCycle`. Aqui só há leitura,
 * gravação e ordem das operações.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildInvoiceItems,
  calculateCycle,
  computeNextCycleStart,
  determineNextCycleUnitPrice,
} from "./billingEngine";
import type { PlanCode } from "./plans";

export type CloseCycleResult =
  | {
      ok: true;
      invoiceId: string;
      totalAmountCents: number;
      nextCycleId: string | null;
      alreadyClosed: boolean;
    }
  | { ok: false; error: string };

type CycleRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  status: string;
  cycle_start: string;
  unit_price_cents: number;
  promotion_threshold_orders: number;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  plan_id: string;
  status: string;
};

type InvoiceRef = { id: string; total_cents: number };
type PlanRef = { code: PlanCode };
type InsertedRef = { id: string };

/**
 * As tabelas de cobrança ainda não estão em `types.ts` porque a migration não
 * foi aplicada ao projeto Supabase. O cast desaparece quando os tipos forem
 * regerados; o formato está declarado acima para não perder a checagem.
 */
type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };

/**
 * Construtor de consulta do Supabase, encadeável. Modelado só até onde este
 * módulo usa: `then` permite `await` em qualquer ponto da cadeia, que é como
 * o cliente real se comporta.
 */
type QueryBuilder = {
  select: (columns?: string, options?: { count?: "exact"; head?: boolean }) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  update: (values: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  maybeSingle: () => PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;

type AdminClient = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<QueryResult>;
};

const client = () => supabaseAdmin as unknown as AdminClient;

/** Número de fatura legível e ordenável: FC-2026-000123. */
function buildInvoiceNumber(sequence: number, when: Date): string {
  return `FC-${when.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Fecha um ciclo, emite a fatura e abre o próximo com o preço já ajustado
 * pela regra da promoção.
 *
 * Idempotente: chamar duas vezes no mesmo ciclo devolve a fatura existente em
 * vez de emitir a segunda. A trava definitiva é o índice único
 * `invoices_one_per_cycle`.
 */
export async function closeBillingCycle(cycleId: string): Promise<CloseCycleResult> {
  const db = client();

  const { data: cycle, error: cycleError } = await db
    .from("billing_cycles")
    .select(
      "id, subscription_id, company_id, status, cycle_start, unit_price_cents, promotion_threshold_orders",
    )
    .eq("id", cycleId)
    .maybeSingle();

  if (cycleError) return { ok: false, error: `Falha ao ler o ciclo: ${cycleError.message}` };
  if (!cycle) return { ok: false, error: "Ciclo não encontrado." };

  const typedCycle = cycle as CycleRow;

  // Ciclo já fechado nunca é recalculado — é isso que impede alteração
  // retroativa de valor.
  if (typedCycle.status !== "open" && typedCycle.status !== "calculating") {
    const { data: existingRaw } = await db
      .from("invoices")
      .select("id, total_cents")
      .eq("billing_cycle_id", cycleId)
      .neq("status", "canceled")
      .maybeSingle();
    const existing = existingRaw as InvoiceRef | null;

    return existing
      ? {
          ok: true,
          invoiceId: existing.id,
          totalAmountCents: existing.total_cents,
          nextCycleId: null,
          alreadyClosed: true,
        }
      : { ok: false, error: "Ciclo fechado sem fatura correspondente. Requer conferência manual." };
  }

  const { data: subscription, error: subError } = await db
    .from("subscriptions")
    .select("id, company_id, plan_id, status")
    .eq("id", typedCycle.subscription_id)
    .maybeSingle();

  if (subError || !subscription) return { ok: false, error: "Assinatura do ciclo não encontrada." };
  const typedSub = subscription as SubscriptionRow;

  const { data: planRaw } = await db
    .from("plans")
    .select("code")
    .eq("id", typedSub.plan_id)
    .maybeSingle();
  const plan = planRaw as PlanRef | null;
  if (!plan) return { ok: false, error: "Plano da assinatura não encontrado." };
  const planCode = plan.code;

  // A contagem vem da soma dos eventos, e não do contador da linha: se os
  // dois divergirem, os eventos é que são a verdade auditável.
  const { data: trueCount, error: countError } = await db.rpc("billing_cycle_true_count", {
    p_cycle_id: cycleId,
  });
  if (countError) return { ok: false, error: `Falha ao contar o consumo: ${countError.message}` };
  const billableOrderCount = Number(trueCount ?? 0);

  // A taxa de cadastro é decidida por item de fatura já emitido, e não pelo
  // número do ciclo — um ciclo pode ser reprocessado, a taxa é uma só.
  const { data: setupCharged } = await db
    .from("subscription_setup_fee_charged")
    .select("subscription_id")
    .eq("subscription_id", typedSub.id)
    .maybeSingle();

  const totals = calculateCycle({
    planCode,
    unitPriceCents: typedCycle.unit_price_cents,
    promotionThresholdOrders: typedCycle.promotion_threshold_orders,
    billableOrderCount,
    setupFeeAlreadyCharged: !!setupCharged,
  });

  const now = new Date();

  const { error: updateError } = await db
    .from("billing_cycles")
    .update({
      status: "closed",
      billable_order_count: billableOrderCount,
      gross_usage_amount_cents: totals.usageAmountCents,
      setup_fee_amount_cents: totals.setupFeeAmountCents,
      monthly_fee_amount_cents: totals.monthlyFeeAmountCents,
      discount_amount_cents: totals.discountAmountCents,
      total_amount_cents: totals.totalAmountCents,
      qualified_for_next_cycle: totals.qualifiedForNextCycle,
      closed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", cycleId)
    // Fecha somente se ainda estiver aberto: duas execuções simultâneas, só
    // uma fecha.
    .eq("status", typedCycle.status);

  if (updateError) return { ok: false, error: `Falha ao fechar o ciclo: ${updateError.message}` };

  const { count } = await db.from("invoices").select("id", { count: "exact", head: true });
  const invoiceNumber = buildInvoiceNumber(Number(count ?? 0) + 1, now);

  const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: invoiceRaw, error: invoiceError } = await db
    .from("invoices")
    .insert({
      company_id: typedCycle.company_id,
      subscription_id: typedSub.id,
      billing_cycle_id: cycleId,
      invoice_number: invoiceNumber,
      status: "pending",
      subtotal_cents: totals.totalAmountCents + totals.discountAmountCents,
      discount_cents: totals.discountAmountCents,
      total_cents: totals.totalAmountCents,
      due_at: dueAt.toISOString(),
      payment_provider: "manual",
    })
    .select("id")
    .maybeSingle();
  const invoice = invoiceRaw as InsertedRef | null;

  if (invoiceError || !invoice) {
    // O índice único de uma fatura viva por ciclo transformou uma emissão
    // duplicada em conflito. Devolvemos a que já existe.
    const { data: existingRaw } = await db
      .from("invoices")
      .select("id, total_cents")
      .eq("billing_cycle_id", cycleId)
      .neq("status", "canceled")
      .maybeSingle();
    const existing = existingRaw as InvoiceRef | null;

    if (existing) {
      return {
        ok: true,
        invoiceId: existing.id,
        totalAmountCents: existing.total_cents,
        nextCycleId: null,
        alreadyClosed: true,
      };
    }
    return {
      ok: false,
      error: `Falha ao emitir a fatura: ${invoiceError?.message ?? "desconhecida"}`,
    };
  }

  const items = buildInvoiceItems(planCode, totals);
  if (items.length > 0) {
    await db.from("invoice_items").insert(
      items.map((item) => ({
        invoice_id: invoice.id,
        item_type: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unit_amount_cents: item.unitAmountCents,
        total_amount_cents: item.totalAmountCents,
      })),
    );
  }

  // Abre o próximo ciclo já com o preço definido pela qualificação. É aqui
  // que R$ 0,45 passa a valer — nunca no ciclo que atingiu a meta.
  const nextUnitPrice = determineNextCycleUnitPrice({
    planCode,
    qualifiedForNextCycle: totals.qualifiedForNextCycle,
  });
  const nextStart = computeNextCycleStart(new Date(typedCycle.cycle_start));

  let nextCycleId: string | null = null;
  if (typedSub.status === "active" || typedSub.status === "past_due") {
    const { data: nextId } = await db.rpc("open_billing_cycle", {
      p_subscription_id: typedSub.id,
      p_cycle_start: nextStart.toISOString(),
      p_unit_price_cents: nextUnitPrice,
      p_qualified_from_previous: totals.qualifiedForNextCycle,
    });
    nextCycleId = (nextId as string | null) ?? null;
  }

  await db.from("subscription_events").insert({
    subscription_id: typedSub.id,
    company_id: typedCycle.company_id,
    event_type: totals.qualifiedForNextCycle ? "promotion_qualified" : "billing_cycle_closed",
    metadata: {
      billing_cycle_id: cycleId,
      invoice_id: invoice.id,
      billable_order_count: billableOrderCount,
      unit_price_cents: typedCycle.unit_price_cents,
      total_amount_cents: totals.totalAmountCents,
      next_unit_price_cents: nextUnitPrice,
    },
  });

  return {
    ok: true,
    invoiceId: invoice.id,
    totalAmountCents: totals.totalAmountCents,
    nextCycleId,
    alreadyClosed: false,
  };
}

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
import { buildInvoiceItems, calculateCycle, determineNextCycleUnitPrice } from "./billingEngine";
import { politicaParaCiclo } from "./centsTiers";
import { computeCycleStartAfter } from "./trial";
import { getPlanPricing, type PlanCode } from "./plans";

export type CloseCycleResult =
  | {
      ok: true;
      /** Nulo quando o ciclo fechado era o gratuito: brinde não gera fatura. */
      invoiceId: string | null;
      totalAmountCents: number;
      nextCycleId: string | null;
      alreadyClosed: boolean;
      freeTrial: boolean;
    }
  | { ok: false; error: string };

type CycleRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  status: string;
  cycle_start: string;
  cycle_end: string;
  cycle_type: string | null;
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
      "id, subscription_id, company_id, status, cycle_start, cycle_end, cycle_type, " +
        "unit_price_cents, promotion_threshold_orders",
    )
    .eq("id", cycleId)
    .maybeSingle();

  if (cycleError) return { ok: false, error: `Falha ao ler o ciclo: ${cycleError.message}` };
  if (!cycle) return { ok: false, error: "Ciclo não encontrado." };

  const typedCycle = cycle as CycleRow;
  const isFreeTrial = typedCycle.cycle_type === "free_trial";

  // Ciclo já fechado nunca é recalculado — é isso que impede alteração
  // retroativa de valor.
  if (typedCycle.status !== "open" && typedCycle.status !== "calculating") {
    // Ciclo gratuito fechado não tem fatura para reencontrar, e isso é o
    // esperado: não se emite conta de R$ 0,00.
    if (isFreeTrial) {
      return {
        ok: true,
        invoiceId: null,
        totalAmountCents: 0,
        nextCycleId: null,
        alreadyClosed: true,
        freeTrial: true,
      };
    }

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
          freeTrial: false,
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

  if (isFreeTrial) {
    return closeFreeTrialCycle(db, typedCycle, typedSub, planCode, billableOrderCount);
  }

  // A taxa de cadastro é decidida por item de fatura já emitido, e não pelo
  // número do ciclo — um ciclo pode ser reprocessado, a taxa é uma só.
  const { data: setupCharged } = await db
    .from("subscription_setup_fee_charged")
    .select("subscription_id")
    .eq("subscription_id", typedSub.id)
    .maybeSingle();

  // Qual tabela de preços vale para ESTE ciclo.
  //
  // Quem decide é a data em que o ciclo abriu, não a data de hoje. Assim um
  // ciclo de julho fechado com atraso em setembro continua sendo cobrado com
  // o preço de julho — é o mesmo princípio da comanda: o cliente paga o preço
  // que estava no cardápio quando pediu, não o que subiu depois.
  const politicaDoCiclo = politicaParaCiclo(
    typedCycle.cycle_start,
    process.env as Record<string, string | undefined>,
  );

  const totals = calculateCycle({
    planCode,
    unitPriceCents: typedCycle.unit_price_cents,
    promotionThresholdOrders: typedCycle.promotion_threshold_orders,
    billableOrderCount,
    setupFeeAlreadyCharged: !!setupCharged,
    centsPolicy: politicaDoCiclo.versao,
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
        freeTrial: false,
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

  // Abre o próximo ciclo já com o preço de largada.
  //
  // Nas faixas, o mês novo sempre começa na primeira faixa: o desconto se
  // conquista dentro do mês e não passa para o mês seguinte. Na regra antiga
  // é aqui que R$ 0,45 passava a valer — nunca no ciclo que bateu a meta.
  const nextUnitPrice = determineNextCycleUnitPrice({
    planCode,
    qualifiedForNextCycle: totals.qualifiedForNextCycle,
    centsPolicy: totals.centsPolicy,
  });
  const nextStart = computeCycleStartAfter({
    cycleType: typedCycle.cycle_type,
    cycleStart: new Date(typedCycle.cycle_start),
    cycleEnd: new Date(typedCycle.cycle_end),
  });

  let nextCycleId: string | null = null;
  if (typedSub.status === "active" || typedSub.status === "past_due") {
    const { data: nextId } = await db.rpc("open_billing_cycle", {
      p_subscription_id: typedSub.id,
      p_cycle_start: nextStart.toISOString(),
      p_unit_price_cents: nextUnitPrice,
      p_qualified_from_previous: totals.qualifiedForNextCycle,
      p_cycle_type: "usage",
    });
    nextCycleId = (nextId as string | null) ?? null;
  }

  await syncSubscriptionSnapshot(db, typedSub.id, nextCycleId);

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
    freeTrial: false,
  };
}

/**
 * Fecha o ciclo gratuito e começa o ciclo cobrado.
 *
 * O que NÃO acontece aqui é o mais importante: nenhuma fatura é emitida,
 * nenhum valor é cobrado e o acesso não é cortado. O cliente termina os 30
 * dias e simplesmente continua trabalhando — só que a partir daí os pedidos
 * passam a contar para a conta que será apresentada no fim do ciclo seguinte.
 *
 * É como o restaurante que oferece a primeira semana de entregas por conta da
 * casa: no oitavo dia ninguém tranca a porta do cliente, apenas a comanda
 * passa a ser anotada.
 */
async function closeFreeTrialCycle(
  db: AdminClient,
  cycle: CycleRow,
  subscription: SubscriptionRow,
  planCode: PlanCode,
  billableOrderCount: number,
): Promise<CloseCycleResult> {
  const now = new Date();

  const { error: closeError } = await db
    .from("billing_cycles")
    .update({
      status: "closed",
      billable_order_count: billableOrderCount,
      gross_usage_amount_cents: 0,
      setup_fee_amount_cents: 0,
      monthly_fee_amount_cents: 0,
      discount_amount_cents: 0,
      total_amount_cents: 0,
      qualified_for_next_cycle: false,
      closed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", cycle.id)
    // Duas execuções simultâneas: só uma fecha.
    .eq("status", cycle.status);

  if (closeError) {
    return { ok: false, error: `Falha ao fechar o período grátis: ${closeError.message}` };
  }

  // A assinatura deixa de ser "grátis" e passa a ser "ativa". A troca é feita
  // aqui, no servidor, a partir da data gravada — e não por algo que a tela
  // resolva sozinha.
  await db
    .from("subscriptions")
    .update({ status: "active", updated_at: now.toISOString() })
    .eq("id", subscription.id)
    .eq("status", "free_trial");

  await db.from("pizzerias").update({ subscription_status: "active" }).eq("id", cycle.company_id);

  // O ciclo cobrado começa no instante seguinte ao fim do grátis: nenhum dia
  // fica sem ciclo, e nenhum pedido fica sem lugar para ser contado.
  const nextStart = computeCycleStartAfter({
    cycleType: cycle.cycle_type,
    cycleStart: new Date(cycle.cycle_start),
    cycleEnd: new Date(cycle.cycle_end),
  });

  const { data: nextId } = await db.rpc("open_billing_cycle", {
    p_subscription_id: subscription.id,
    p_cycle_start: nextStart.toISOString(),
    p_unit_price_cents: getPlanPricing(planCode).defaultOrderUnitPriceCents,
    p_qualified_from_previous: false,
    p_cycle_type: "usage",
  });
  const nextCycleId = (nextId as string | null) ?? null;

  const firstChargeAt = await syncSubscriptionSnapshot(db, subscription.id, nextCycleId);

  await db.from("subscription_events").insert({
    subscription_id: subscription.id,
    company_id: cycle.company_id,
    event_type: "free_trial_ended",
    previous_status: "free_trial",
    new_status: "active",
    reason: "Período grátis concluído; ciclo cobrado iniciado",
    metadata: {
      billing_cycle_id: cycle.id,
      next_billing_cycle_id: nextCycleId,
      orders_during_trial: billableOrderCount,
      first_charge_at: firstChargeAt,
    },
  });

  return {
    ok: true,
    invoiceId: null,
    totalAmountCents: 0,
    nextCycleId,
    alreadyClosed: false,
    freeTrial: true,
  };
}

/**
 * Copia para a assinatura os dados do ciclo recém-aberto.
 *
 * A tela do cliente lê uma linha só em vez de somar eventos toda vez que o
 * painel abre. `first_charge_at` é a data em que a conta será apresentada —
 * o fechamento do ciclo cobrado, nunca antes.
 *
 * Devolve essa data, para quem chamou registrar no histórico.
 */
async function syncSubscriptionSnapshot(
  db: AdminClient,
  subscriptionId: string,
  nextCycleId: string | null,
): Promise<string | null> {
  if (!nextCycleId) return null;

  const { data: rowRaw } = await db
    .from("billing_cycles")
    .select("cycle_start, cycle_end, unit_price_cents")
    .eq("id", nextCycleId)
    .maybeSingle();

  const row = rowRaw as {
    cycle_start: string;
    cycle_end: string;
    unit_price_cents: number;
  } | null;
  if (!row) return null;

  await db
    .from("subscriptions")
    .update({
      billing_cycle_started_at: row.cycle_start,
      billing_cycle_ends_at: row.cycle_end,
      first_charge_at: row.cycle_end,
      current_order_rate: row.unit_price_cents,
      total_billable_orders: 0,
      amount_due: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  return row.cycle_end;
}

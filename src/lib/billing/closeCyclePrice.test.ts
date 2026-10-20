import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeBillingDb";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return holder.db;
  },
}));

import { closeBillingCycle } from "./closeCycle.server";

/**
 * O fechamento de ciclo é o que emite a fatura de renovação (o robô diário
 * chama esta mesma função). Aqui se prova que o valor cobrado é o da versão
 * de preço CONTRATADA, e não o da tabela de hoje.
 */
function setup(opts: {
  planCode: "premium" | "premium_anual";
  versionFee: number;
  interval: 1 | 12;
  cycleStart: string;
  cycleEnd: string;
}): FakeDb {
  const db = createFakeDb({
    billing_cycles: [
      {
        id: "ciclo-1",
        subscription_id: "sub-1",
        company_id: "loja",
        status: "open",
        cycle_start: opts.cycleStart,
        cycle_end: opts.cycleEnd,
        cycle_type: "usage",
        unit_price_cents: 0,
        promotion_threshold_orders: 0,
        cents_policy: "cents_v2",
      },
    ],
    subscriptions: [
      {
        id: "sub-1",
        company_id: "loja",
        plan_id: "plano",
        plan_price_version_id: "versao",
        status: "active",
      },
    ],
    plans: [{ id: "plano", code: opts.planCode, billing_model: "monthly_fixed" }],
    plan_price_versions: [
      { id: "versao", monthly_fee_cents: opts.versionFee, billing_interval_months: opts.interval },
    ],
    subscription_setup_fee_charged: [],
    invoices: [],
    invoice_items: [],
    subscription_events: [],
  });
  db.rpcHandlers.billing_cycle_true_count = () => ({ data: 321, error: null });
  db.rpcHandlers.open_billing_cycle = () => ({ data: "ciclo-2", error: null });
  holder.db = db;
  return db;
}

describe("fatura de renovação usa o preço contratado", () => {
  beforeEach(() => {
    holder.db = null;
  });

  it("assinante antigo do Premium (R$ 375,00) continua pagando R$ 375,00", async () => {
    const db = setup({
      planCode: "premium",
      versionFee: 37500,
      interval: 1,
      cycleStart: "2026-09-08T22:50:52.000Z",
      cycleEnd: "2026-10-08T22:50:51.999Z",
    });
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 37500 });
    expect(db.tables.invoices[0]).toMatchObject({ total_cents: 37500 });
    expect(db.tables.invoice_items[0]).toMatchObject({
      item_type: "monthly_fee",
      total_amount_cents: 37500,
    });
  });

  it("Premium Mensal novo cobra R$ 89,90 na renovação", async () => {
    setup({
      planCode: "premium",
      versionFee: 8990,
      interval: 1,
      cycleStart: "2026-10-15T15:00:00.000Z",
      cycleEnd: "2026-11-15T14:59:59.999Z",
    });
    expect(await closeBillingCycle("ciclo-1")).toMatchObject({ ok: true, totalAmountCents: 8990 });
  });

  it("Premium Anual cobra R$ 598,80 e o próximo ciclo começa só depois do ano pago", async () => {
    const db = setup({
      planCode: "premium_anual",
      versionFee: 59880,
      interval: 12,
      cycleStart: "2026-10-15T15:00:00.000Z",
      cycleEnd: "2027-10-15T14:59:59.999Z",
    });
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 59880 });
    expect(db.tables.invoice_items[0]).toMatchObject({
      description: "Anuidade do plano Premium Anual (12 meses)",
    });
    const abertura = db.rpcCalls.find((c) => c.fn === "open_billing_cycle");
    expect(abertura?.args?.p_cycle_start).toBe("2027-10-15T15:00:00.000Z");
  });

  it("sem a versão de preço, não emite fatura (não chuta o valor da tabela)", async () => {
    const db = setup({
      planCode: "premium",
      versionFee: 37500,
      interval: 1,
      cycleStart: "2026-09-08T22:50:52.000Z",
      cycleEnd: "2026-10-08T22:50:51.999Z",
    });
    db.tables.plan_price_versions = [];
    const out = await closeBillingCycle("ciclo-1");
    expect(out.ok).toBe(false);
    expect(db.tables.invoices).toHaveLength(0);
  });

  it("na troca de plano (openNext: false) fecha sem abrir o próximo ciclo", async () => {
    const db = setup({
      planCode: "premium",
      versionFee: 8990,
      interval: 1,
      cycleStart: "2026-10-15T15:00:00.000Z",
      cycleEnd: "2026-11-15T14:59:59.999Z",
    });
    await closeBillingCycle("ciclo-1", { openNext: false });
    expect(db.rpcCalls.find((c) => c.fn === "open_billing_cycle")).toBeUndefined();
  });
});

describe("troca agendada aplicada na virada do ciclo", () => {
  function comTroca(status: string, subVersion = "versao") {
    const db = setup({
      planCode: "premium",
      versionFee: 8990,
      interval: 1,
      cycleStart: "2026-10-15T15:00:00.000Z",
      cycleEnd: "2026-11-15T14:59:59.999Z",
    });
    db.tables.subscriptions[0].plan_price_version_id = subVersion;
    db.tables.plans.push({
      id: "plano-anual",
      code: "premium_anual",
      billing_model: "monthly_fixed",
    });
    db.tables.plan_price_versions.push({
      id: "versao-anual",
      monthly_fee_cents: 59880,
      billing_interval_months: 12,
    });
    db.tables.subscription_plan_changes = [
      {
        id: "troca-1",
        subscription_id: "sub-1",
        status,
        source: "customer_switch",
        from_price_version_id: "versao",
        to_plan_id: "plano-anual",
        to_price_version_id: "versao-anual",
      },
    ];
    return db;
  }

  it("mensal → anual: a fatura da renovação já sai R$ 598,80 e o ciclo novo abre no anual", async () => {
    const db = comTroca("scheduled");
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 59880 });
    expect(db.tables.invoice_items[0]).toMatchObject({
      description: "Anuidade do plano Premium Anual (12 meses)",
      total_amount_cents: 59880,
    });
    expect(db.tables.subscriptions[0]).toMatchObject({
      plan_id: "plano-anual",
      plan_price_version_id: "versao-anual",
    });
    expect(db.tables.subscription_plan_changes[0]).toMatchObject({
      status: "applied",
      applied_cycle_id: "ciclo-1",
    });
    // O ciclo que fechou era mensal: o próximo começa no mês seguinte (regra
    // de sempre), e a abertura lê a duração (12 meses) da versão nova.
    const abertura = db.rpcCalls.find((c) => c.fn === "open_billing_cycle");
    expect(abertura?.args?.p_cycle_start).toBe("2026-11-15T00:00:00.000Z");
    expect(
      db.tables.subscription_events.some((e) => e.event_type === "scheduled_plan_change_applied"),
    ).toBe(true);
  });

  it("aplicar duas vezes não cobra nem troca duas vezes", async () => {
    const db = comTroca("scheduled");
    await closeBillingCycle("ciclo-1");
    const again = await closeBillingCycle("ciclo-1");
    expect(again).toMatchObject({ ok: true, alreadyClosed: true });
    expect(db.tables.invoices).toHaveLength(1);
  });

  it("troca 'aguardando a equipe' (cobrança pausada) NUNCA é aplicada pelo robô", async () => {
    const db = comTroca("awaiting_team");
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 8990 });
    expect(db.tables.subscriptions[0].plan_price_version_id).toBe("versao");
    expect(db.tables.subscription_plan_changes[0].status).toBe("awaiting_team");
  });

  it("assinatura mudada por outro caminho: a troca é cancelada e o preço contratado vale", async () => {
    const db = comTroca("scheduled");
    db.tables.subscriptions[0].plan_price_version_id = "outra-versao";
    db.tables.plan_price_versions.push({
      id: "outra-versao",
      monthly_fee_cents: 12345,
      billing_interval_months: 1,
    });
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 12345 });
    expect(db.tables.subscription_plan_changes[0].status).toBe("canceled");
  });

  it("na troca de plano por compra (openNext: false) a troca agendada não é tocada", async () => {
    const db = comTroca("scheduled");
    await closeBillingCycle("ciclo-1", { openNext: false });
    expect(db.tables.subscription_plan_changes[0].status).toBe("scheduled");
  });
});

describe("oferta aceita pelo assinante antigo (R$ 375 → R$ 89,90)", () => {
  it("na renovação a fatura passa a R$ 89,90", async () => {
    const db = setup({
      planCode: "premium",
      versionFee: 37500,
      interval: 1,
      cycleStart: "2026-10-15T15:00:00.000Z",
      cycleEnd: "2026-11-15T14:59:59.999Z",
    });
    db.tables.plan_price_versions.push({
      id: "versao-v2",
      monthly_fee_cents: 8990,
      billing_interval_months: 1,
    });
    db.tables.subscription_plan_changes = [
      {
        id: "oferta",
        subscription_id: "sub-1",
        status: "scheduled",
        source: "legacy_offer",
        from_price_version_id: "versao",
        to_plan_id: "plano",
        to_price_version_id: "versao-v2",
      },
    ];
    const out = await closeBillingCycle("ciclo-1");
    expect(out).toMatchObject({ ok: true, totalAmountCents: 8990 });
    expect(db.tables.subscriptions[0].plan_price_version_id).toBe("versao-v2");
  });
});

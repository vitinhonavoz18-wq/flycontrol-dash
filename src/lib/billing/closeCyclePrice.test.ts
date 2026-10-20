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
    plans: [{ id: "plano", code: opts.planCode }],
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

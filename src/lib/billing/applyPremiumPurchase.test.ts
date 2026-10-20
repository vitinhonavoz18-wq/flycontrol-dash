import { describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeBillingDb";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("./closeCycle.server", () => ({ closeBillingCycle: vi.fn() }));
vi.mock("./infinitypay/recurringCharge.server", () => ({ createRecurringCharge: vi.fn() }));

import {
  applyPremiumPurchase,
  type ApplyDeps,
  type PurchaseIntent,
} from "./applyPremiumPurchase.server";

const NOW = new Date("2026-10-15T15:00:00.000Z");

const intent = (o: Partial<PurchaseIntent> = {}): PurchaseIntent => ({
  id: "intent-1",
  company_id: "loja-a",
  plan_code: "premium_anual",
  plan_price_version_id: "pv-anual",
  expected_amount_cents: 59880,
  created_by: "dono-a",
  ...o,
});

const meta = { transactionNsu: "tx-1", captureMethod: "pix", paidAmountCents: 59880 };

function setup(sub: Record<string, unknown> | null, extra: Record<string, unknown[]> = {}) {
  const db: FakeDb = createFakeDb({
    plans: [
      { id: "plan-premium", code: "premium", billing_model: "monthly_fixed" },
      { id: "plan-anual", code: "premium_anual", billing_model: "monthly_fixed" },
      { id: "plan-cents", code: "cents", billing_model: "usage_per_order" },
    ],
    subscriptions: sub ? [sub] : [],
    billing_cycles: [],
    invoices: [],
    subscription_events: [],
    checkout_intents: [{ id: "intent-1", status: "confirmed" }],
    ...(extra as Record<string, Record<string, unknown>[]>),
  });
  db.rpcHandlers.open_billing_cycle = () => ({ data: "ciclo-novo", error: null });

  const closeCycle = vi.fn(async () => ({
    ok: true as const,
    invoiceId: "fatura-cents",
    totalAmountCents: 4200,
    nextCycleId: null,
    alreadyClosed: false,
    freeTrial: false,
  }));
  const createCharge = vi.fn(async () => ({
    ok: true as const,
    paymentTransactionId: "pt",
    checkoutUrl: "https://x",
  }));
  const updateCompany = vi.fn(async () => undefined);
  const deps: ApplyDeps = {
    db,
    closeCycle: closeCycle as unknown as ApplyDeps["closeCycle"],
    createCharge: createCharge as unknown as ApplyDeps["createCharge"],
    updateCompany,
    now: () => NOW,
  };
  return { db, deps, closeCycle, createCharge, updateCompany };
}

const centsSub = {
  id: "sub-a",
  company_id: "loja-a",
  status: "active",
  plan_id: "plan-cents",
  plan_price_version_id: "pv-cents",
  current_cycle_id: "ciclo-cents",
  plans: { code: "cents" },
  created_at: "2026-09-01T00:00:00Z",
};

describe("aplicar o Premium pago pelo painel", () => {
  it("CENTS → Premium Anual: fecha o ciclo do CENTS (cobra só o usado), troca o plano e abre 12 meses", async () => {
    const { db, deps, closeCycle, createCharge, updateCompany } = setup(centsSub, {
      billing_cycles: [
        {
          id: "ciclo-cents",
          subscription_id: "sub-a",
          status: "open",
          cycle_start: "2026-10-01T00:00:00Z",
          cycle_end: "2026-10-31T23:59:59Z",
        },
      ],
    });

    const out = await applyPremiumPurchase(intent(), meta, deps);
    expect(out).toEqual({ applied: true, subscriptionId: "sub-a", cycleId: "ciclo-novo" });

    // O ciclo do CENTS termina agora e fecha SEM abrir o seguinte no CENTS.
    expect(db.tables.billing_cycles[0].cycle_end).toBe(NOW.toISOString());
    expect(closeCycle).toHaveBeenCalledWith("ciclo-cents", { openNext: false });
    // Os pedidos já feitos no CENTS viram fatura com link.
    expect(createCharge).toHaveBeenCalledWith("fatura-cents");

    // Troca no MESMO registro, com a versão de preço que foi paga.
    const sub = db.tables.subscriptions[0];
    expect(sub).toMatchObject({
      id: "sub-a",
      plan_id: "plan-anual",
      plan_price_version_id: "pv-anual",
      status: "active",
      payment_provider: "infinitypay",
    });
    expect(db.tables.subscriptions).toHaveLength(1);

    // Primeiro ciclo do plano novo começa no pagamento; a duração (12 meses)
    // vem da versão de preço, dentro de open_billing_cycle.
    expect(db.rpcCalls).toContainEqual({
      fn: "open_billing_cycle",
      args: expect.objectContaining({
        p_subscription_id: "sub-a",
        p_cycle_start: NOW.toISOString(),
      }),
    });

    // Recursos Premium liberados na loja certa.
    expect(updateCompany).toHaveBeenCalledWith("loja-a", {
      plan_type: "premium",
      billing_model: "fixed",
      subscription_status: "active",
    });

    const evento = db.tables.subscription_events.find((e) => e.event_type === "premium_purchased");
    expect(evento?.metadata).toMatchObject({
      previous_plan_code: "cents",
      new_plan_code: "premium_anual",
      paid_amount_cents: 59880,
      transaction_nsu: "tx-1",
      initiated_by_customer: true,
    });
  });

  it("Premium pago antigo (ADEGA, R$ 375) NÃO é trocado: o pagamento fica para conferência", async () => {
    const adega = {
      ...centsSub,
      id: "sub-adega",
      plan_id: "plan-premium",
      plan_price_version_id: "pv-premium-v1",
      plans: { code: "premium" },
    };
    const { db, deps, closeCycle, updateCompany } = setup(adega);
    const out = await applyPremiumPurchase(intent(), meta, deps);

    expect(out.applied).toBe(false);
    expect(closeCycle).not.toHaveBeenCalled();
    expect(updateCompany).not.toHaveBeenCalled();
    // Preço e plano contratados intactos.
    expect(db.tables.subscriptions[0]).toMatchObject({
      plan_id: "plan-premium",
      plan_price_version_id: "pv-premium-v1",
      status: "active",
    });
    expect(db.tables.checkout_intents[0].activation_note).toMatch(/^conferir:/);
    expect(
      db.tables.subscription_events.some((e) => e.event_type === "premium_payment_needs_review"),
    ).toBe(true);
  });

  it("só mexe na assinatura da loja que pagou (outra loja fica intacta)", async () => {
    const outraLoja = { ...centsSub, id: "sub-b", company_id: "loja-b" };
    const { db, deps } = setup(centsSub, { subscriptions: [centsSub, outraLoja] });
    await applyPremiumPurchase(intent(), meta, deps);
    const b = db.tables.subscriptions.find((s) => s.id === "sub-b");
    expect(b).toMatchObject({ plan_id: "plan-cents", status: "active" });
  });

  it("período grátis do CENTS termina sem fatura", async () => {
    const { deps, closeCycle, createCharge } = setup(
      { ...centsSub, status: "free_trial" },
      {
        billing_cycles: [
          {
            id: "ciclo-gratis",
            subscription_id: "sub-a",
            status: "open",
            cycle_start: "2026-10-01T00:00:00Z",
            cycle_end: "2026-10-31T00:00:00Z",
          },
        ],
      },
    );
    closeCycle.mockResolvedValueOnce({
      ok: true,
      invoiceId: null,
      totalAmountCents: 0,
      nextCycleId: null,
      alreadyClosed: false,
      freeTrial: true,
    } as never);
    const out = await applyPremiumPurchase(intent({ plan_code: "premium" }), meta, deps);
    expect(out.applied).toBe(true);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("loja sem assinatura ganha uma, já no plano pago", async () => {
    const { db, deps } = setup(null);
    const out = await applyPremiumPurchase(intent({ plan_code: "premium" }), meta, deps);
    expect(out.applied).toBe(true);
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      company_id: "loja-a",
      plan_id: "plan-premium",
      status: "active",
    });
  });
});

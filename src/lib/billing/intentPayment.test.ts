import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeBillingDb";

// Nada de rede nem de Supabase real neste teste.
vi.mock("@/lib/provisioning/ensureProvisioned.server", () => ({
  provisionAndForget: vi.fn(async () => undefined),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  },
}));

import {
  reconcileOpenCheckoutIntents,
  verifyAndConfirmCheckoutIntent,
  type IntentConfirmDeps,
} from "./intentPayment.server";

const INTENT_ID = "11111111-1111-4111-8111-111111111111";

function seed(overrides: Record<string, unknown> = {}): FakeDb {
  return createFakeDb({
    checkout_intents: [
      {
        id: INTENT_ID,
        company_id: "loja-a",
        subscription_id: null,
        plan_code: "premium_anual",
        status: "started",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        expected_amount_cents: 59880,
        kind: "upgrade",
        plan_price_version_id: "pv-anual",
        created_by: "dono-a",
        created_at: new Date(Date.now() - 3600_000).toISOString(),
        ...overrides,
      },
    ],
  });
}

function deps(db: FakeDb, check: IntentConfirmDeps["check"]) {
  const applyUpgrade = vi.fn(async () => ({
    applied: true as const,
    subscriptionId: "s",
    cycleId: "c",
  }));
  const activateSignup = vi.fn(async () => undefined);
  return { db, check, applyUpgrade, activateSignup };
}

const paid = (amount: number) => async () => ({
  ok: true as const,
  paid: true,
  paidAmountCents: amount,
  captureMethod: "pix",
});

describe("confirmação de pagamento de contratação", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = seed();
  });

  it("pagamento aprovado (reconferido na InfinityPay) ativa o plano — uma vez", async () => {
    const d = deps(db, vi.fn(paid(59880)));
    const out = await verifyAndConfirmCheckoutIntent(
      { intentId: INTENT_ID, transactionNsu: "tx-1" },
      d,
    );
    expect(out).toEqual({ ok: true, alreadyConfirmed: false, kind: "upgrade", applied: true });
    expect(d.applyUpgrade).toHaveBeenCalledTimes(1);
    const row = db.tables.checkout_intents[0];
    expect(row.status).toBe("confirmed");
    expect(row.transaction_nsu).toBe("tx-1");
    expect(row.paid_amount_cents).toBe(59880);
    expect(row.capture_method).toBe("pix");
  });

  it("aviso duplicado não ativa de novo", async () => {
    const d = deps(db, vi.fn(paid(59880)));
    await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    const segundo = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(segundo).toMatchObject({ ok: true, alreadyConfirmed: true });
    expect(d.applyUpgrade).toHaveBeenCalledTimes(1);
    // O segundo nem pergunta à InfinityPay de novo.
    expect(d.check).toHaveBeenCalledTimes(1);
  });

  it("dois avisos ao mesmo tempo: só um reivindica", async () => {
    const d = deps(db, vi.fn(paid(59880)));
    const [a, b] = await Promise.all([
      verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d),
      verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d),
    ]);
    const novos = [a, b].filter((o) => o.ok && !o.alreadyConfirmed);
    expect(novos).toHaveLength(1);
    expect(d.applyUpgrade).toHaveBeenCalledTimes(1);
  });

  it("pagamento PENDENTE não libera", async () => {
    const d = deps(
      db,
      vi.fn(async () => ({
        ok: true as const,
        paid: false,
        paidAmountCents: null,
        captureMethod: null,
      })),
    );
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: false, reason: "not_confirmed" });
    expect(d.applyUpgrade).not.toHaveBeenCalled();
    expect(db.tables.checkout_intents[0].status).toBe("started");
  });

  it("pagamento RECUSADO / consulta com erro não libera", async () => {
    const d = deps(
      db,
      vi.fn(async () => ({ ok: false as const, error: "infinitypay_http_404" })),
    );
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: false, reason: "check_failed" });
    expect(d.applyUpgrade).not.toHaveBeenCalled();
  });

  it("valor pago menor que o do plano (ex.: R$ 49,90 no anual) não libera", async () => {
    const d = deps(db, vi.fn(paid(4990)));
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: false, reason: "not_confirmed" });
    expect(d.applyUpgrade).not.toHaveBeenCalled();
  });

  it("intenção cancelada não é confirmada", async () => {
    db = seed({ status: "canceled" });
    const d = deps(db, vi.fn(paid(59880)));
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: false, reason: "canceled" });
    expect(d.check).not.toHaveBeenCalled();
  });

  it("intenção vencida mas PAGA na InfinityPay é honrada (o cliente pagou)", async () => {
    db = seed({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const d = deps(db, vi.fn(paid(59880)));
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: true, alreadyConfirmed: false });
  });

  it("cadastro pago segue o caminho do cadastro, não o da troca de plano", async () => {
    db = seed({ kind: "signup", plan_code: "premium", expected_amount_cents: 8990 });
    const d = deps(db, vi.fn(paid(8990)));
    const out = await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID }, d);
    expect(out).toMatchObject({ ok: true, kind: "signup" });
    expect(d.activateSignup).toHaveBeenCalledTimes(1);
    expect(d.applyUpgrade).not.toHaveBeenCalled();
  });

  it("a InfinityPay é consultada pelo order_nsu da intenção (nunca pelo que o aviso diz do valor)", async () => {
    const check = vi.fn(paid(59880));
    await verifyAndConfirmCheckoutIntent({ intentId: INTENT_ID, slug: "abc" }, deps(db, check));
    expect(check).toHaveBeenCalledWith({ orderNsu: INTENT_ID, transactionNsu: null, slug: "abc" });
  });
});

describe("robô: contratações pagas cujo aviso se perdeu", () => {
  it("reconfere as abertas e ativa a que foi paga", async () => {
    const db = seed();
    const d = deps(db, vi.fn(paid(59880)));
    const out = await reconcileOpenCheckoutIntents(d);
    expect(out).toMatchObject({ checked: 1, confirmed: 1 });
    expect(d.applyUpgrade).toHaveBeenCalledTimes(1);
  });

  it("ignora as recém-criadas (o aviso normal ainda pode chegar)", async () => {
    const db = seed({ created_at: new Date().toISOString() });
    const d = deps(db, vi.fn(paid(59880)));
    const out = await reconcileOpenCheckoutIntents(d);
    expect(out.checked).toBe(0);
  });
});

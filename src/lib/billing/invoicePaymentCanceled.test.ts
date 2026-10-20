import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeBillingDb";

const pizzeriaUpdates: unknown[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      update: (v: unknown) => ({
        eq: async () => {
          pizzeriaUpdates.push(v);
          return { error: null };
        },
      }),
    }),
  },
}));
vi.mock("./infinitypay/api", () => ({
  checkInfinityPayPayment: vi.fn(async () => ({
    ok: true,
    paid: true,
    paidAmountCents: 37500,
    captureMethod: "pix",
  })),
}));

import { verifyAndConfirmInvoicePayment } from "./invoicePayment.server";

describe("pagamento de fatura CANCELADA (ex.: cobrança pausada da ADEGA)", () => {
  it("não marca a fatura como paga, não reabre ciclo e registra para conferência", async () => {
    const db = createFakeDb({
      payment_transactions: [
        { id: "pt-1", invoice_id: "inv-1", status: "pending", amount_cents: 37500 },
      ],
      invoices: [
        { id: "inv-1", subscription_id: "sub-adega", company_id: "adega", status: "canceled" },
      ],
      subscriptions: [{ id: "sub-adega", status: "active" }],
      subscription_events: [],
    });

    const out = await verifyAndConfirmInvoicePayment({ paymentTransactionId: "pt-1" }, db);

    expect(out).toEqual({ ok: true, alreadyPaid: false });
    expect(db.tables.invoices[0].status).toBe("canceled");
    expect(db.rpcCalls.find((c) => c.fn === "open_billing_cycle")).toBeUndefined();
    expect(pizzeriaUpdates).toEqual([]);
    expect(db.tables.subscription_events[0]).toMatchObject({
      event_type: "payment_on_canceled_invoice",
    });
    // O dinheiro não some: a cobrança fica registrada como paga.
    expect(db.tables.payment_transactions[0].status).toBe("paid");
  });

  it("fatura pendente normal continua sendo baixada e renovada", async () => {
    const db = createFakeDb({
      payment_transactions: [
        { id: "pt-2", invoice_id: "inv-2", status: "pending", amount_cents: 37500 },
      ],
      invoices: [{ id: "inv-2", subscription_id: "sub-x", company_id: "x", status: "pending" }],
      subscriptions: [{ id: "sub-x", status: "active" }],
      subscription_events: [],
    });
    await verifyAndConfirmInvoicePayment({ paymentTransactionId: "pt-2" }, db);
    expect(db.tables.invoices[0].status).toBe("paid");
    expect(db.rpcCalls.find((c) => c.fn === "open_billing_cycle")).toBeDefined();
  });
});

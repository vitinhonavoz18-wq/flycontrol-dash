import { describe, expect, it } from "vitest";
import {
  ManualPaymentGateway,
  PaymentGatewayError,
  getPaymentGateway,
  isProviderRegistered,
  registerPaymentGateway,
  type PaymentGateway,
} from "./paymentGateway";

const gateway = new ManualPaymentGateway();

describe("provedor manual — o que ele NÃO faz", () => {
  it("não inventa código PIX", async () => {
    // Um copia-e-cola de exemplo levaria o cliente a tentar pagar uma
    // cobrança que não existe em lugar nenhum.
    const charge = await gateway.createPixCharge({
      invoiceId: "inv-1",
      companyId: "company-1",
      amountCents: 37500,
      description: "Mensalidade PREMIUM",
      idempotencyKey: "inv-1",
    });

    expect(charge.copyPaste).toBeNull();
    expect(charge.qrCodeReference).toBeNull();
    expect(charge.expiresAt).toBeNull();
    expect(charge.externalTransactionId).toBeNull();
  });

  it("nunca devolve status pago", async () => {
    const charge = await gateway.createPixCharge({
      invoiceId: "inv-1",
      companyId: "company-1",
      amountCents: 9500,
      description: "Taxa de cadastro",
      idempotencyKey: "inv-1",
    });
    expect(charge.status).toBe("pending");
    expect(await gateway.getChargeStatus()).toBe("pending");
  });

  it("recusa estorno em vez de fingir que estornou", async () => {
    // Um estorno que "deu certo" sem devolver dinheiro é pior que um erro.
    await expect(gateway.refundCharge()).rejects.toBeInstanceOf(PaymentGatewayError);
    await expect(gateway.refundCharge()).rejects.toThrow(/indisponível/i);
  });

  it("recusa qualquer webhook", async () => {
    // Sem provedor configurado não existe webhook legítimo. Aceitar deixaria
    // faturas serem marcadas como pagas por quem descobrisse a URL.
    const result = await gateway.verifyWebhookSignature();
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toMatch(/nenhum provedor/i);
  });

  it("declara que não cobra sozinho", () => {
    expect(gateway.canChargeAutomatically).toBe(false);
  });

  it("preserva o valor da cobrança em centavos", async () => {
    const charge = await gateway.createPixCharge({
      invoiceId: "inv-1",
      companyId: "company-1",
      amountCents: 24290,
      description: "Consumo do ciclo",
      idempotencyKey: "inv-1",
    });
    expect(charge.amountCents).toBe(24290);
    expect(Number.isSafeInteger(charge.amountCents)).toBe(true);
  });

  it("explica ao operador por que não há PIX", async () => {
    const charge = await gateway.createPixCharge({
      invoiceId: "inv-1",
      companyId: "company-1",
      amountCents: 100,
      description: "x",
      idempotencyKey: "inv-1",
    });
    expect(charge.note).toBeTruthy();
  });
});

describe("seleção do provedor", () => {
  it("usa o manual por padrão", () => {
    expect(getPaymentGateway().code).toBe("manual");
  });

  it("cai no manual quando o provedor pedido não existe", () => {
    // Começar a cobrar por engano é pior do que não cobrar.
    expect(getPaymentGateway("provedor_inexistente").code).toBe("manual");
    expect(isProviderRegistered("infinitypay")).toBe(false);
  });

  it("aceita um provedor novo sem alterar quem o consome", () => {
    // É este teste que prova que a abstração serve para o que foi feita:
    // registrar a InfinityPay depois não deve exigir tocar em cobrança.
    const fake: PaymentGateway = {
      code: "infinitypay",
      canChargeAutomatically: true,
      createCustomer: async () => ({ externalCustomerId: "cus_1", provider: "infinitypay" }),
      createPixCharge: async (input) => ({
        externalTransactionId: "tx_1",
        provider: "infinitypay",
        status: "pending",
        amountCents: input.amountCents,
        copyPaste: "00020126...",
        qrCodeReference: "qr_1",
        expiresAt: "2026-08-07T12:00:00Z",
        note: null,
      }),
      getChargeStatus: async () => "paid",
      cancelCharge: async () => {},
      refundCharge: async () => {},
      verifyWebhookSignature: async () => ({
        valid: true,
        event: {
          provider: "infinitypay",
          externalTransactionId: "tx_1",
          status: "paid",
          amountCents: 37500,
          paidAt: "2026-08-06T12:00:00Z",
          raw: {},
        },
      }),
    };

    registerPaymentGateway(fake);
    expect(isProviderRegistered("infinitypay")).toBe(true);
    expect(getPaymentGateway("infinitypay").canChargeAutomatically).toBe(true);
  });
});

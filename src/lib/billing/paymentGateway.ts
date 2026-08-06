/**
 * Camada de abstração de pagamento.
 *
 * A InfinityPay entra aqui depois, como uma implementação a mais. O resto do
 * sistema fala com esta interface e não conhece nenhum provedor — trocar de
 * gateway, ou usar dois em paralelo, não deve exigir tocar em cobrança.
 *
 * Nada nesta etapa faz chamada externa. `ManualPaymentGateway` registra a
 * intenção de cobrança e devolve o estado pendente; a confirmação continua
 * sendo ato administrativo auditado.
 */

import type { Cents } from "./money";

export type PaymentProviderCode = "manual" | "infinitypay";

export type ChargeStatus =
  "pending" | "processing" | "paid" | "failed" | "expired" | "refunded" | "canceled";

export type GatewayCustomer = {
  externalCustomerId: string;
  provider: PaymentProviderCode;
};

/**
 * Dados de uma cobrança PIX.
 *
 * `copyPaste`, `qrCodeReference` e `expiresAt` são nulos enquanto não houver
 * provedor real. Preenchê-los com valor de exemplo produziria um QR Code que
 * o cliente tentaria pagar — e nenhum sistema receberia.
 */
export type PixCharge = {
  externalTransactionId: string | null;
  provider: PaymentProviderCode;
  status: ChargeStatus;
  amountCents: Cents;
  copyPaste: string | null;
  qrCodeReference: string | null;
  expiresAt: string | null;
  /** Explica ao operador por que não há PIX, quando for o caso. */
  note: string | null;
};

export type CreateCustomerInput = {
  companyId: string;
  companyName: string;
  email: string;
  document?: string | null;
  phone?: string | null;
};

export type CreateChargeInput = {
  invoiceId: string;
  companyId: string;
  amountCents: Cents;
  description: string;
  externalCustomerId?: string | null;
  /** Impede cobrança duplicada quando a chamada é repetida. */
  idempotencyKey: string;
};

export type WebhookVerification =
  { valid: true; event: WebhookEvent } | { valid: false; reason: string };

export type WebhookEvent = {
  provider: PaymentProviderCode;
  externalTransactionId: string;
  status: ChargeStatus;
  amountCents: Cents | null;
  paidAt: string | null;
  raw: unknown;
};

/**
 * Contrato que qualquer provedor precisa cumprir.
 *
 * Os métodos são assíncronos mesmo quando a implementação atual é síncrona:
 * a versão real fará rede, e mudar a assinatura depois quebraria todos os
 * chamadores.
 */
export interface PaymentGateway {
  readonly code: PaymentProviderCode;
  /** `false` quando o provedor não consegue cobrar sozinho. */
  readonly canChargeAutomatically: boolean;

  createCustomer(input: CreateCustomerInput): Promise<GatewayCustomer>;
  createPixCharge(input: CreateChargeInput): Promise<PixCharge>;
  getChargeStatus(externalTransactionId: string): Promise<ChargeStatus>;
  cancelCharge(externalTransactionId: string): Promise<void>;
  refundCharge(externalTransactionId: string, amountCents: Cents): Promise<void>;

  /**
   * Valida a assinatura do webhook ANTES de interpretar o corpo.
   *
   * Sem isso, qualquer um que descubra a URL marca faturas como pagas. É a
   * verificação mais importante de toda a integração.
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerification>;
}

/** Erro de provedor, com a informação que o chamador precisa para decidir. */
export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** `true` quando repetir a chamada pode dar certo (rede, 5xx, timeout). */
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

/**
 * Provedor usado enquanto a InfinityPay não está integrada.
 *
 * Não cobra: registra a intenção e devolve `pending`. Toda operação que
 * exigiria o provedor real falha de forma explícita, em vez de fingir
 * sucesso — um estorno que "deu certo" sem estornar nada é pior que um erro.
 */
export class ManualPaymentGateway implements PaymentGateway {
  readonly code = "manual" as const;
  readonly canChargeAutomatically = false;

  async createCustomer(input: CreateCustomerInput): Promise<GatewayCustomer> {
    // Sem provedor, o identificador do cliente é a própria empresa. Quando a
    // InfinityPay entrar, ela devolve o ID dela e este some.
    return { externalCustomerId: `manual:${input.companyId}`, provider: this.code };
  }

  async createPixCharge(input: CreateChargeInput): Promise<PixCharge> {
    // Nenhum campo de PIX é preenchido. Um código copia-e-cola inventado
    // levaria o cliente a tentar pagar em uma cobrança que não existe.
    return {
      externalTransactionId: null,
      provider: this.code,
      status: "pending",
      amountCents: input.amountCents,
      copyPaste: null,
      qrCodeReference: null,
      expiresAt: null,
      note: "Cobrança automática ainda não disponível. A ativação é feita manualmente pela equipe.",
    };
  }

  async getChargeStatus(): Promise<ChargeStatus> {
    // O status real vive na fatura, alterado por um administrador. Consultar
    // um provedor que não existe não traria informação nova.
    return "pending";
  }

  async cancelCharge(): Promise<void> {
    // Não há cobrança externa para cancelar; cancelar a fatura é operação do
    // painel administrativo.
  }

  async refundCharge(): Promise<never> {
    throw new PaymentGatewayError(
      "Estorno automático indisponível: nenhum provedor de pagamento está integrado.",
      "refund_unsupported",
      false,
    );
  }

  async verifyWebhookSignature(): Promise<WebhookVerification> {
    // Recusa incondicional. Sem provedor configurado não existe webhook
    // legítimo, e aceitar qualquer chamada deixaria faturas serem marcadas
    // como pagas por quem descobrisse a URL.
    return { valid: false, reason: "Nenhum provedor de pagamento configurado." };
  }
}

const registry = new Map<PaymentProviderCode, PaymentGateway>([
  ["manual", new ManualPaymentGateway()],
]);

/** Registra um provedor. A InfinityPay se registra aqui quando existir. */
export function registerPaymentGateway(gateway: PaymentGateway): void {
  registry.set(gateway.code, gateway);
}

/**
 * Provedor ativo, definido por `PAYMENT_PROVIDER`.
 *
 * Cai no manual quando a variável está ausente ou aponta para um provedor não
 * registrado: começar a cobrar por engano é pior do que não cobrar.
 */
export function getPaymentGateway(code?: string): PaymentGateway {
  const requested = (code ?? process.env.PAYMENT_PROVIDER ?? "manual").trim();
  const gateway = registry.get(requested as PaymentProviderCode);

  if (!gateway) {
    console.warn(`[payment] provedor "${requested}" não registrado; usando o manual.`);
    return registry.get("manual")!;
  }
  return gateway;
}

export function isProviderRegistered(code: string): boolean {
  return registry.has(code as PaymentProviderCode);
}

/**
 * Cliente HTTP da API de checkout da InfinityPay.
 *
 * Cobre só o que este projeto usa: criar um link de pagamento por cadastro
 * (com retorno e aviso de pagamento apontando para cá) e reconferir uma
 * cobrança diretamente com a InfinityPay antes de confiar em qualquer coisa
 * que chegue de fora.
 *
 * A InfinityPay não assina o aviso de pagamento (webhook) — não há segredo
 * nem cabeçalho para conferir nele. A segurança real deste módulo não está em
 * validar quem chamou o aviso: está em nunca acreditar nele sozinho. Toda
 * confirmação é reconferida aqui, com a própria InfinityPay, antes de ativar
 * qualquer assinatura — é a "Reconferência" (Double Check) que a própria
 * InfinityPay recomenda.
 */

const LINKS_URL = "https://api.checkout.infinitepay.io/links";
const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";
const TIMEOUT_MS = 15_000;

/** InfiniteTag da conta que recebe o pagamento. Sem ela não há como cobrar. */
export function infinityPayHandle(): string | null {
  const handle = (process.env.INFINITYPAY_HANDLE || "").trim().replace(/^\$/, "");
  return handle || null;
}

/** Lê o primeiro campo presente que seja texto não vazio (ou número, como texto). */
function firstText(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function firstNumber(obj: Record<string, unknown> | null, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "number") return value;
  }
  return null;
}

async function parseJsonBody(text: string): Promise<Record<string, unknown> | null> {
  if (!text) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

export type CreateLinkInput = {
  /** Identificador do nosso lado (o id da intenção de checkout). Volta no aviso de pagamento. */
  orderNsu: string;
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
};

export type CreateLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Cria um link de pagamento novo, específico deste cadastro.
 *
 * Diferente de um link fixo colado à mão no painel, este link nasce com o
 * `redirect_url` e o `webhook_url` corretos embutidos — nada para configurar
 * manualmente por plano.
 */
export async function createInfinityPayCheckoutLink(
  input: CreateLinkInput,
): Promise<CreateLinkResult> {
  const handle = infinityPayHandle();
  if (!handle) return { ok: false, error: "missing_handle" };

  const body = {
    handle,
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
    items: [{ quantity: 1, price: input.amountCents, description: input.description }],
  };

  try {
    const resp = await fetch(LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await resp.text();
    console.log("[infinitypay] POST /links status:", resp.status, "body:", text.slice(0, 500));

    let parsed: Record<string, unknown> | null;
    try {
      parsed = await parseJsonBody(text);
    } catch {
      return {
        ok: false,
        error: !resp.ok ? `infinitypay_http_${resp.status}` : "infinitypay_invalid_json",
      };
    }

    if (!resp.ok) {
      // A InfinityPay manda o motivo em `message` (ex.: "param is missing or
      // the value is empty or invalid: handle"). Sem isso no retorno, o único
      // jeito de descobrir por que um cadastro caiu no modo manual seria ler
      // o corpo bruto no log do servidor.
      const reason = firstText(parsed, "message", "error");
      return {
        ok: false,
        error: reason
          ? `infinitypay_http_${resp.status}: ${reason}`
          : `infinitypay_http_${resp.status}`,
      };
    }

    // O nome exato do campo de retorno não está documentado publicamente;
    // aceita as variações mais prováveis em vez de travar em uma só.
    const url = firstText(parsed, "url", "checkout_url", "link");
    if (!url) return { ok: false, error: "infinitypay_missing_url_in_response" };

    return { ok: true, url };
  } catch (err) {
    console.error("[infinitypay] falha ao criar link de checkout:", err);
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

export type PaymentCheckInput = {
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
};

export type PaymentCheckResult =
  | {
      ok: true;
      paid: boolean;
      paidAmountCents: number | null;
      captureMethod: string | null;
    }
  | { ok: false; error: string };

/**
 * Reconfirma uma cobrança diretamente com a InfinityPay.
 *
 * É esta chamada, e não o aviso de pagamento, que decide se uma assinatura
 * pode ser ativada. O aviso só avisa; quem confirma é a InfinityPay, de novo,
 * aqui.
 */
export async function checkInfinityPayPayment(
  input: PaymentCheckInput,
): Promise<PaymentCheckResult> {
  const handle = infinityPayHandle();
  if (!handle) return { ok: false, error: "missing_handle" };

  const body: Record<string, unknown> = { handle, order_nsu: input.orderNsu };
  if (input.transactionNsu) body.transaction_nsu = input.transactionNsu;
  if (input.slug) body.slug = input.slug;

  try {
    const resp = await fetch(PAYMENT_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await resp.text();
    console.log(
      "[infinitypay] POST /payment_check status:",
      resp.status,
      "body:",
      text.slice(0, 500),
    );

    let parsed: Record<string, unknown> | null;
    try {
      parsed = await parseJsonBody(text);
    } catch {
      return {
        ok: false,
        error: !resp.ok ? `infinitypay_http_${resp.status}` : "infinitypay_invalid_json",
      };
    }

    if (!resp.ok) {
      const reason = firstText(parsed, "message", "error");
      return {
        ok: false,
        error: reason
          ? `infinitypay_http_${resp.status}: ${reason}`
          : `infinitypay_http_${resp.status}`,
      };
    }

    if (parsed?.success === false) {
      return { ok: false, error: String(parsed?.message ?? "infinitypay_check_failed") };
    }

    return {
      ok: true,
      paid: parsed?.paid === true,
      paidAmountCents: firstNumber(parsed, "paid_amount"),
      captureMethod: firstText(parsed, "capture_method") ?? null,
    };
  } catch (err) {
    console.error("[infinitypay] falha ao reconferir pagamento:", err);
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

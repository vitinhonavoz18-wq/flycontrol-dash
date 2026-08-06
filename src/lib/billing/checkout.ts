/**
 * Checkout por link da InfinityPay.
 *
 * O modelo é: o cliente é mandado para uma URL de checkout hospedada pela
 * InfinityPay, paga lá, e é devolvido para uma URL fixa configurada no painel
 * dela. Essa URL de retorno é a mesma para todo mundo.
 *
 * Duas consequências que moldam este arquivo:
 *
 * 1. A URL de retorno não prova pagamento. Ela é estática, aparece no
 *    histórico do navegador e pode ser aberta por qualquer um. Por isso o
 *    retorno carrega um token de intenção emitido por nós no momento em que
 *    mandamos o cliente para o checkout.
 *
 * 2. Existe uma URL de retorno por plano. Isso não é redundância: é o que
 *    permite recusar quem pagou o checkout de um plano e voltou pela URL de
 *    outro.
 */

import { PLAN_PRICING, type PlanCode } from "./plans";
import type { Cents } from "./money";

/** Quanto tempo uma intenção continua aceitável depois de criada. */
export const CHECKOUT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Chave do token no armazenamento local do navegador. */
export const CHECKOUT_TOKEN_STORAGE_KEY = "flycontrol.checkout.intent";

/** Caminho de retorno de um plano. É o que vai colado no painel da InfinityPay. */
export function checkoutReturnPath(planCode: PlanCode): string {
  return `/pagamento/${planCode}`;
}

/** URL absoluta de retorno, para exibir e copiar. */
export function checkoutReturnUrl(origin: string, planCode: PlanCode): string {
  return `${origin.replace(/\/+$/, "")}${checkoutReturnPath(planCode)}`;
}

/**
 * Valor que o checkout daquele plano deve cobrar na entrada.
 *
 * PREMIUM cobra a mensalidade. CENTS cobra a taxa de cadastro — o consumo por
 * pedido é faturado depois, no fechamento do ciclo, e não passa por este
 * checkout.
 */
export function checkoutAmountCents(planCode: PlanCode): Cents {
  const pricing = PLAN_PRICING[planCode];
  return pricing.billingModel === "monthly_fixed" ? pricing.monthlyFeeCents : pricing.setupFeeCents;
}

export type CheckoutConfig =
  { configured: true; url: string } | { configured: false; reason: string };

const ENV_BY_PLAN: Record<PlanCode, string> = {
  premium: "INFINITYPAY_CHECKOUT_URL_PREMIUM",
  cents: "INFINITYPAY_CHECKOUT_URL_CENTS",
};

/** Nome da variável de ambiente que guarda o checkout de um plano. */
export function checkoutEnvVar(planCode: PlanCode): string {
  return ENV_BY_PLAN[planCode];
}

/**
 * Resolve a URL de checkout de um plano a partir do ambiente.
 *
 * Recusa qualquer coisa que não seja https. Esta URL é usada para redirecionar
 * o cliente: uma variável mal preenchida vira um desvio do fluxo de pagamento
 * para onde o valor apontar.
 */
export function resolveCheckoutConfig(
  planCode: PlanCode,
  env: Record<string, string | undefined>,
): CheckoutConfig {
  const varName = ENV_BY_PLAN[planCode];
  const raw = env[varName]?.trim();

  if (!raw) {
    return {
      configured: false,
      reason: `Checkout do plano ${planCode} não configurado (${varName} vazia).`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { configured: false, reason: `${varName} não é uma URL válida.` };
  }

  if (parsed.protocol !== "https:") {
    return { configured: false, reason: `${varName} precisa ser https.` };
  }

  return { configured: true, url: parsed.toString() };
}

/**
 * Política de ativação no retorno do checkout.
 *
 * Padrão desligado, e isso é deliberado. Ligado, qualquer pessoa que inicie um
 * cadastro, seja mandada ao checkout e feche a página sem pagar consegue
 * ativar a própria conta apenas abrindo a URL de retorno — o token de intenção
 * dela é legítimo, só o pagamento que não aconteceu.
 *
 * Faz sentido ligar quando se aceita conscientemente esse risco em troca de
 * ativação imediata. Desligue de volta assim que a confirmação vier da própria
 * InfinityPay.
 */
export function shouldTrustCheckoutReturn(env: Record<string, string | undefined>): boolean {
  return env.INFINITYPAY_TRUST_RETURN?.trim().toLowerCase() === "true";
}

export type IntentValidation = { ok: true } | { ok: false; code: IntentRejection; message: string };

export type IntentRejection =
  "not_found" | "expired" | "already_used" | "plan_mismatch" | "canceled";

export type StoredIntent = {
  planCode: string;
  status: string;
  expiresAt: string;
};

/**
 * Decide se uma intenção pode aceitar o retorno de um checkout.
 *
 * Separada do acesso ao banco de propósito: é a regra que decide se alguém
 * entra ou não, e precisa ser testável sem Postgres.
 */
export function validateIntentForReturn(
  intent: StoredIntent | null,
  planCodeFromUrl: string,
  now: Date = new Date(),
): IntentValidation {
  if (!intent) {
    return {
      ok: false,
      code: "not_found",
      message: "Não encontramos o registro deste checkout neste navegador.",
    };
  }

  if (intent.status === "canceled") {
    return { ok: false, code: "canceled", message: "Este checkout foi cancelado." };
  }

  // 'confirmed' é final: reabrir a URL de retorno não pode confirmar de novo.
  if (intent.status === "confirmed") {
    return {
      ok: false,
      code: "already_used",
      message: "Este pagamento já foi registrado.",
    };
  }

  if (intent.status === "expired" || new Date(intent.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      code: "expired",
      message: "O prazo deste checkout venceu. Fale com a equipe para retomar o cadastro.",
    };
  }

  // A checagem que justifica existir uma URL de retorno por plano: pagar o
  // checkout do CENTS e voltar pela URL do PREMIUM não pode virar PREMIUM.
  if (intent.planCode !== planCodeFromUrl) {
    return {
      ok: false,
      code: "plan_mismatch",
      message: "O plano deste retorno não corresponde ao do checkout iniciado.",
    };
  }

  return { ok: true };
}

/** Token de intenção. 32 bytes de aleatoriedade criptográfica. */
export function generateIntentToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash do token, que é o que vai para o banco. */
export async function hashIntentToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

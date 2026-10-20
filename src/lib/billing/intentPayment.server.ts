/**
 * Confirmação do pagamento de uma contratação (cadastro ou Premium pelo
 * painel). Servidor apenas.
 *
 * Três caminhos chegam aqui e terminam no MESMO lugar:
 *   - o aviso da InfinityPay (webhook);
 *   - o cliente voltando da InfinityPay para /pagamento/<plano>;
 *   - o robô diário, que reconfere contratações cujo aviso pode ter se perdido.
 *
 * Nenhum deles confia no que ouviu. A InfinityPay não assina o aviso (não há
 * segredo nem cabeçalho de assinatura na documentação oficial), então todos
 * ligam de volta para ela (`payment_check`) e só seguem se ela confirmar
 * "pago" com valor igual ou maior que o esperado. É conferir o extrato do
 * banco, e não o print que o cliente mandou.
 *
 * Pagamento pendente ou recusado não chega a "pago" na reconferência — e por
 * isso nunca ativa nada.
 *
 * Idempotência: a intenção é reivindicada com uma gravação condicionada ao
 * status lido. Dois avisos iguais (a InfinityPay reenvia quando não recebe
 * 200) ou aviso + retorno + robô ao mesmo tempo: só um passa; os outros
 * encontram "já confirmada" e não fazem nada. Mais um cadeado no banco: uma
 * mesma transação da InfinityPay não confirma duas intenções (índice único).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb, type BillingDb } from "./supabaseBridge";
import { checkInfinityPayPayment, type PaymentCheckResult } from "./infinitypay/api";
import { validateGatewayConfirmation } from "./checkout";
import { openFirstCycle } from "./activateSubscription.server";
import { applyPremiumPurchase, type ApplyResult } from "./applyPremiumPurchase.server";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";

export type IntentRow = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  plan_code: string;
  status: string;
  expires_at: string;
  expected_amount_cents: number;
  kind?: string | null;
  plan_price_version_id?: string | null;
  created_by?: string | null;
};

export type IntentConfirmOutcome =
  | { ok: true; alreadyConfirmed: boolean; kind: "signup" | "upgrade"; applied: boolean }
  | {
      ok: false;
      reason: "not_found" | "canceled" | "check_failed" | "not_confirmed";
      message: string;
    };

export type IntentConfirmDeps = {
  db: BillingDb;
  check: (input: {
    orderNsu: string;
    transactionNsu?: string | null;
    slug?: string | null;
  }) => Promise<PaymentCheckResult>;
  activateSignup: (db: BillingDb, intent: IntentRow, meta: PaymentMeta) => Promise<void>;
  applyUpgrade: (intent: IntentRow, meta: PaymentMeta, db: BillingDb) => Promise<ApplyResult>;
};

export type PaymentMeta = {
  transactionNsu: string | null;
  captureMethod: string | null;
  paidAmountCents: number | null;
};

const INTENT_COLUMNS =
  "id, company_id, subscription_id, plan_code, status, expires_at, expected_amount_cents, " +
  "kind, plan_price_version_id, created_by";

const LEGACY_INTENT_COLUMNS =
  "id, company_id, subscription_id, plan_code, status, expires_at, expected_amount_cents";

/** Postgres: coluna inexistente. */
const UNDEFINED_COLUMN = "42703";

function defaultDeps(): IntentConfirmDeps {
  return {
    db: asBillingDb(supabaseAdmin),
    check: checkInfinityPayPayment,
    activateSignup: activateSignupSubscription,
    applyUpgrade: (intent, meta, db) =>
      applyPremiumPurchase(
        {
          id: intent.id,
          company_id: intent.company_id,
          plan_code: intent.plan_code,
          plan_price_version_id: intent.plan_price_version_id ?? null,
          expected_amount_cents: intent.expected_amount_cents,
          created_by: intent.created_by ?? null,
        },
        meta,
        db,
      ),
  };
}

export async function verifyAndConfirmCheckoutIntent(
  input: { intentId: string; transactionNsu?: string | null; slug?: string | null },
  overrides: Partial<IntentConfirmDeps> = {},
): Promise<IntentConfirmOutcome> {
  const deps = { ...defaultDeps(), ...overrides };
  const { db } = deps;

  let { data: found, error } = await db
    .from("checkout_intents")
    .select(INTENT_COLUMNS)
    .eq("id", input.intentId)
    .maybeSingle();

  // Coluna inexistente: a migration de 15/10 ainda não foi aplicada. Lê só o
  // que sempre existiu, para o cadastro pago continuar ativando como antes.
  if (error?.code === UNDEFINED_COLUMN) {
    ({ data: found, error } = await db
      .from("checkout_intents")
      .select(LEGACY_INTENT_COLUMNS)
      .eq("id", input.intentId)
      .maybeSingle());
  }

  if (error || !found) {
    return { ok: false, reason: "not_found", message: "pedido não encontrado" };
  }
  const intent = found as IntentRow;
  const kind = intent.kind === "upgrade" ? "upgrade" : "signup";

  // Reaviso de algo já processado: responder "ok" encerra a repetição da
  // InfinityPay sem reprocessar nada.
  if (intent.status === "confirmed") {
    return { ok: true, alreadyConfirmed: true, kind, applied: false };
  }
  if (intent.status === "canceled") {
    return { ok: false, reason: "canceled", message: "Este checkout foi cancelado." };
  }

  // Vencida NÃO é recusada aqui. O prazo da intenção protege o link de
  // retorno contra reuso; ele não pode servir de desculpa para ficar com o
  // dinheiro de quem pagou o link da InfinityPay depois de 24h. Se a
  // InfinityPay diz que foi pago, foi pago.
  const check = await deps.check({
    orderNsu: intent.id,
    transactionNsu: input.transactionNsu ?? null,
    slug: input.slug ?? null,
  });
  if (!check.ok) {
    return { ok: false, reason: "check_failed", message: check.error };
  }

  const confirmation = validateGatewayConfirmation(
    { paid: check.paid, paidAmountCents: check.paidAmountCents },
    intent.expected_amount_cents,
  );
  if (!confirmation.ok) {
    return { ok: false, reason: "not_confirmed", message: confirmation.message };
  }

  const nowIso = new Date().toISOString();
  const meta: PaymentMeta = {
    transactionNsu: input.transactionNsu ?? null,
    captureMethod: check.captureMethod,
    paidAmountCents: check.paidAmountCents,
  };

  // Reivindicação única. Os campos de comprovante só são enviados nas
  // contratações pelo painel (que nascem depois da migration de 15/10) —
  // num cadastro antigo, mandar colunas que ainda não existem faria a
  // confirmação inteira falhar.
  const claim: Record<string, unknown> = {
    status: "confirmed",
    returned_at: nowIso,
    confirmed_at: nowIso,
    updated_at: nowIso,
  };
  if (intent.kind !== undefined) {
    claim.paid_amount_cents = check.paidAmountCents;
    claim.transaction_nsu = input.transactionNsu ?? null;
    claim.capture_method = check.captureMethod;
  }

  const { data: claimed } = await db
    .from("checkout_intents")
    .update(claim)
    .eq("id", intent.id)
    .eq("status", intent.status)
    .select("id")
    .maybeSingle();

  if (!claimed) return { ok: true, alreadyConfirmed: true, kind, applied: false };

  if (kind === "upgrade") {
    const result = await deps.applyUpgrade(intent, meta, db);
    return { ok: true, alreadyConfirmed: false, kind, applied: result.applied };
  }

  await deps.activateSignup(db, intent, meta);
  return { ok: true, alreadyConfirmed: false, kind, applied: true };
}

/**
 * Ativação do cadastro pago — o fluxo que já existia no aviso da InfinityPay,
 * movido para cá sem mudar o comportamento: assinatura ativa, primeiro ciclo
 * aberto (1 ou 12 meses, conforme a versão contratada), loja liberada e
 * cardápio criado.
 */
export async function activateSignupSubscription(
  db: BillingDb,
  intent: IntentRow,
  meta: PaymentMeta,
): Promise<void> {
  const nowIso = new Date().toISOString();

  if (intent.subscription_id) {
    await db
      .from("subscriptions")
      .update({
        status: "active",
        activated_at: nowIso,
        billing_anchor_day: new Date(nowIso).getUTCDate(),
        payment_provider: "infinitypay",
        updated_at: nowIso,
      })
      .eq("id", intent.subscription_id);

    await db.from("subscription_events").insert({
      subscription_id: intent.subscription_id,
      company_id: intent.company_id,
      event_type: "checkout_return_activated",
      new_status: "active",
      reason: "Pagamento confirmado pela InfinityPay (reconferência)",
      metadata: {
        plan_code: intent.plan_code,
        checkout_intent_id: intent.id,
        transaction_nsu: meta.transactionNsu,
        capture_method: meta.captureMethod,
        paid_amount_cents: meta.paidAmountCents,
        provider_confirmed: true,
      },
    });

    // Sem isso, o gatilho que conta pedidos no banco nunca teria onde
    // lançar o consumo — a conta ficaria ativa sem ciclo.
    await openFirstCycle(db, intent.subscription_id);
  }

  await supabaseAdmin
    .from("pizzerias")
    .update({ subscription_status: "active" })
    .eq("id", intent.company_id);

  // Onboarding concluído de verdade: pagamento confirmado pela própria
  // InfinityPay. Este é o momento de o cardápio nascer.
  await provisionAndForget(intent.company_id);
}

/**
 * Rede de segurança do robô diário: contratações iniciadas nos últimos dias
 * que continuam "em aberto". Para cada uma, pergunta à InfinityPay se foi
 * paga — o aviso pode ter se perdido no caminho, e quem pagou não pode ficar
 * esperando.
 *
 * Só olha as que têm mais de 10 minutos (o aviso normal chega em segundos)
 * e menos de 7 dias (link esquecido não vira consulta eterna).
 */
export async function reconcileOpenCheckoutIntents(
  overrides: Partial<IntentConfirmDeps> = {},
  now: Date = new Date(),
): Promise<{ checked: number; confirmed: number; errors: string[] }> {
  const deps = { ...defaultDeps(), ...overrides };
  const result = { checked: 0, confirmed: 0, errors: [] as string[] };

  const newest = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const oldest = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await deps.db
    .from("checkout_intents")
    .select("id")
    .in("status", ["started", "returned"])
    .gt("expected_amount_cents", 0)
    .lte("created_at", newest)
    .gte("created_at", oldest);

  if (error) {
    result.errors.push(`Falha ao listar contratações em aberto: ${error.message}`);
    return result;
  }

  for (const row of (data ?? []) as Array<{ id: string }>) {
    result.checked++;
    try {
      const outcome = await verifyAndConfirmCheckoutIntent({ intentId: row.id }, deps);
      if (outcome.ok && !outcome.alreadyConfirmed) result.confirmed++;
      if (!outcome.ok && outcome.reason === "check_failed") {
        result.errors.push(`Contratação ${row.id}: reconferência falhou (${outcome.message})`);
      }
    } catch (err) {
      result.errors.push(
        `Contratação ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return result;
}

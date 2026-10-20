/**
 * Contratação do Premium (Mensal ou Anual) de dentro do painel. Servidor.
 *
 * Duas funções:
 *   - `getPremiumOffer`: o que a tela de planos/checkout precisa saber sobre
 *     a loja logada (plano atual, preço contratado, se pode contratar cada
 *     opção, histórico de contratações).
 *   - `startPremiumCheckout`: cria a cobrança na InfinityPay e devolve o link.
 *
 * As três regras que importam:
 *   1. A loja é SEMPRE a do usuário logado. O navegador não diz "sou a loja
 *      X" — o servidor descobre pelo login, como o caixa que confere a
 *      comanda pelo número da mesa, e não pelo que o cliente diz.
 *   2. O valor é SEMPRE o do banco (versão de preço ativa do plano). O
 *      navegador só diz QUAL plano quer; quanto custa, quem diz é o servidor.
 *      Se o banco e a tela discordarem, a contratação é recusada em vez de
 *      cobrar um valor diferente do que o cliente leu.
 *   3. Nada é ativado aqui. Ativa só a confirmação da InfinityPay (ver
 *      intentPayment.server.ts).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb, type BillingDb } from "./supabaseBridge";
import {
  CHECKOUT_INTENT_TTL_MS,
  checkoutReturnUrl,
  generateIntentToken,
  hashIntentToken,
  infinityPayWebhookUrl,
} from "./checkout";
import { createInfinityPayCheckoutLink, infinityPayHandle } from "./infinitypay/api";
import { PLAN_PRICING, PREMIUM_PLAN_CODES, type PremiumPlanCode } from "./plans";
import {
  buildCheckoutSummary,
  decidePremiumPurchase,
  parseStartCheckoutInput,
  type CheckoutSummary,
  type CurrentSubscription,
  type PurchaseDecision,
} from "./premiumCheckout";

export type PremiumOffer = {
  companyName: string;
  current: {
    planCode: string | null;
    planName: string | null;
    status: string;
    /** O valor que ESTA loja contratou (pode ser diferente da tabela de hoje). */
    contractedCycleFeeCents: number | null;
    intervalMonths: number;
    cycleEnd: string | null;
  } | null;
  options: Record<PremiumPlanCode, { decision: PurchaseDecision; summary: CheckoutSummary }>;
  /** A InfinityPay está configurada no servidor? Sem ela não há como cobrar. */
  gatewayReady: boolean;
  history: Array<{
    id: string;
    planCode: string;
    kind: string;
    status: string;
    expectedAmountCents: number;
    paidAmountCents: number | null;
    createdAt: string;
    confirmedAt: string | null;
    transactionNsu: string | null;
    captureMethod: string | null;
    note: string | null;
  }>;
} | null;

type SubRow = {
  id: string;
  status: string;
  plans: { code: string; name: string } | null;
  plan_price_versions: { monthly_fee_cents: number; billing_interval_months: number | null } | null;
  billing_cycles: { cycle_end: string } | null;
};

async function loadOwnedCompany(userId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("id, name")
    .eq("owner_id", userId)
    .neq("status", "deleted")
    .neq("status", "inactive")
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

async function loadCurrentSubscription(db: BillingDb, companyId: string): Promise<SubRow | null> {
  const { data } = await db
    .from("subscriptions")
    .select(
      "id, status, plans(code, name), plan_price_versions(monthly_fee_cents, billing_interval_months), " +
        "billing_cycles!subscriptions_current_cycle_fkey(cycle_end)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? []) as SubRow[])[0] ?? null;
}

function toCurrent(sub: SubRow | null): CurrentSubscription {
  return sub ? { planCode: sub.plans?.code ?? null, status: sub.status } : null;
}

function gatewayReady(): boolean {
  const publicUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim();
  return !!infinityPayHandle() && !!publicUrl;
}

export const getPremiumOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PremiumOffer> => {
    const company = await loadOwnedCompany(context.userId);
    if (!company) return null;

    const db = asBillingDb(supabaseAdmin);
    const sub = await loadCurrentSubscription(db, company.id);
    const current = toCurrent(sub);

    const options = {} as NonNullable<PremiumOffer>["options"];
    for (const code of PREMIUM_PLAN_CODES) {
      options[code] = {
        decision: decidePremiumPurchase(current, code),
        summary: buildCheckoutSummary(code),
      };
    }

    // Histórico de contratações (cadastro pago e Premium pelo painel). A
    // tabela não tem leitura para o dono — por isso passa por aqui, filtrada
    // pela loja do usuário logado.
    let history: NonNullable<PremiumOffer>["history"] = [];
    const { data: rows, error } = await db
      .from("checkout_intents")
      .select(
        "id, plan_code, kind, status, expected_amount_cents, paid_amount_cents, created_at, " +
          "confirmed_at, transaction_nsu, capture_method, activation_note",
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) {
      history = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        planCode: String(r.plan_code),
        kind: String(r.kind ?? "signup"),
        status: String(r.status),
        expectedAmountCents: Number(r.expected_amount_cents ?? 0),
        paidAmountCents: r.paid_amount_cents == null ? null : Number(r.paid_amount_cents),
        createdAt: String(r.created_at),
        confirmedAt: r.confirmed_at ? String(r.confirmed_at) : null,
        transactionNsu: r.transaction_nsu ? String(r.transaction_nsu) : null,
        captureMethod: r.capture_method ? String(r.capture_method) : null,
        note: r.activation_note ? String(r.activation_note) : null,
      }));
    }

    return {
      companyName: company.name,
      current: sub
        ? {
            planCode: sub.plans?.code ?? null,
            planName: sub.plans?.name ?? null,
            status: sub.status,
            contractedCycleFeeCents: sub.plan_price_versions
              ? Number(sub.plan_price_versions.monthly_fee_cents)
              : null,
            intervalMonths: Number(sub.plan_price_versions?.billing_interval_months ?? 1) || 1,
            cycleEnd: sub.billing_cycles?.cycle_end ?? null,
          }
        : null,
      options,
      gatewayReady: gatewayReady(),
      history,
    };
  });

export type StartPremiumCheckoutInput = {
  planCode: string;
  /** O cliente marcou que leu o valor, o período e a regra de renovação. */
  acceptedTerms: boolean;
};

export const startPremiumCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // Só o código do plano e o aceite passam daqui. Valor, loja e assinatura
  // são descobertos no servidor (ver parseStartCheckoutInput).
  .inputValidator((d: StartPremiumCheckoutInput) => parseStartCheckoutInput(d))
  .handler(async ({ data, context }): Promise<{ url: string; token: string }> => {
    const target = data.planCode as PremiumPlanCode;

    const company = await loadOwnedCompany(context.userId);
    if (!company) throw new Error("Nenhum estabelecimento encontrado para este login.");

    const db = asBillingDb(supabaseAdmin);
    const sub = await loadCurrentSubscription(db, company.id);
    const decision = decidePremiumPurchase(toCurrent(sub), target);
    if (!decision.ok) throw new Error(decision.message);

    if (!gatewayReady()) {
      throw new Error(
        "O pagamento online ainda não está configurado. Fale com a equipe da FlyControl.",
      );
    }

    // O preço que vale: a versão ATIVA do plano, no banco.
    const { data: planRow } = await db
      .from("plans")
      .select("id")
      .eq("code", target)
      .eq("is_active", true)
      .maybeSingle();
    const plan = planRow as { id: string } | null;
    if (!plan) throw new Error("Este plano não está disponível no momento.");

    const { data: versionRow } = await db
      .from("plan_price_versions")
      .select("id, monthly_fee_cents, billing_interval_months")
      .eq("plan_id", plan.id)
      .eq("is_active", true)
      .maybeSingle();
    const version = versionRow as {
      id: string;
      monthly_fee_cents: number;
      billing_interval_months: number | null;
    } | null;

    const catalog = PLAN_PRICING[target];
    if (
      !version ||
      Number(version.monthly_fee_cents) !== catalog.cycleFeeCents ||
      Number(version.billing_interval_months ?? 1) !== catalog.billingIntervalMonths
    ) {
      // Banco e tela discordam (ex.: migration de preço não aplicada). Cobrar
      // seria cobrar um valor diferente do que o cliente acabou de ler.
      console.error(
        `[premium] preço de ${target} no banco difere da tela: ` +
          `${version?.monthly_fee_cents ?? "sem versão"} x ${catalog.cycleFeeCents}`,
      );
      throw new Error(
        "A tabela de preços está sendo atualizada. Tente novamente em alguns minutos.",
      );
    }
    const amountCents = Number(version.monthly_fee_cents);

    const token = generateIntentToken();
    const tokenHash = await hashIntentToken(token);
    const nowMs = Date.now();

    // Clique duplo ou volta ao checkout: reaproveita o link aberto nos
    // últimos 30 minutos para o mesmo plano, em vez de gerar outro. Dois
    // links vivos são duas chances de o cliente pagar duas vezes.
    const { data: reusableRows } = await db
      .from("checkout_intents")
      .select("id, checkout_url, plan_price_version_id, expected_amount_cents")
      .eq("company_id", company.id)
      .eq("kind", "upgrade")
      .eq("plan_code", target)
      .eq("status", "started")
      .gte("created_at", new Date(nowMs - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const reusable = (
      (reusableRows ?? []) as Array<{
        id: string;
        checkout_url: string;
        plan_price_version_id: string | null;
        expected_amount_cents: number;
      }>
    )[0];

    if (
      reusable &&
      reusable.plan_price_version_id === version.id &&
      Number(reusable.expected_amount_cents) === amountCents
    ) {
      const { data: rotated } = await db
        .from("checkout_intents")
        .update({
          token_hash: tokenHash,
          expires_at: new Date(nowMs + CHECKOUT_INTENT_TTL_MS).toISOString(),
          updated_at: new Date(nowMs).toISOString(),
        })
        .eq("id", reusable.id)
        .eq("status", "started")
        .select("id")
        .maybeSingle();
      if (rotated) return { url: reusable.checkout_url, token };
    }

    const publicUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    const intentId = crypto.randomUUID();

    const link = await createInfinityPayCheckoutLink({
      orderNsu: intentId,
      amountCents,
      description:
        target === "premium_anual"
          ? `FlyControl - Premium Anual (12 meses) - ${company.name}`
          : `FlyControl - Premium Mensal - ${company.name}`,
      redirectUrl: checkoutReturnUrl(publicUrl, target),
      webhookUrl: infinityPayWebhookUrl(publicUrl),
    });
    if (!link.ok) {
      console.error(`[premium] link da InfinityPay não criado: ${link.error}`);
      throw new Error("Não foi possível abrir o pagamento agora. Tente novamente em instantes.");
    }

    const { error: insertError } = await db.from("checkout_intents").insert({
      id: intentId,
      token_hash: tokenHash,
      company_id: company.id,
      // Nulo de propósito: numa contratação pelo painel a assinatura atual
      // continua como está até a InfinityPay confirmar o pagamento.
      subscription_id: null,
      plan_code: target,
      kind: "upgrade",
      plan_price_version_id: version.id,
      previous_plan_code: sub?.plans?.code ?? null,
      created_by: context.userId,
      expected_amount_cents: amountCents,
      checkout_url: link.url,
      expires_at: new Date(nowMs + CHECKOUT_INTENT_TTL_MS).toISOString(),
    });
    if (insertError) {
      console.error("[premium] intenção não gravada:", insertError);
      throw new Error("Não foi possível abrir o pagamento agora. Tente novamente em instantes.");
    }

    if (sub) {
      await db.from("subscription_events").insert({
        subscription_id: sub.id,
        company_id: company.id,
        event_type: "premium_checkout_started",
        performed_by: context.userId,
        reason: `Cliente iniciou a contratação do ${catalog.name}`,
        metadata: {
          checkout_intent_id: intentId,
          plan_code: target,
          amount_cents: amountCents,
          interval_months: catalog.billingIntervalMonths,
          // Registro do consentimento: o cliente marcou que leu valor,
          // período e regra de renovação antes de ir pagar.
          accepted_terms: true,
          renewal: "nova cobrança a cada período, sem débito automático",
        },
      });
    }

    return { url: link.url, token };
  });

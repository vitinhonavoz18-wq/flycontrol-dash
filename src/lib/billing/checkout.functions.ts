/**
 * Retorno do checkout por link. Servidor apenas.
 *
 * Esta função é o que roda quando a InfinityPay devolve o cliente para a URL
 * de retorno. Ela registra que o cliente voltou do checkout — e não que ele
 * pagou. A diferença importa: a URL de retorno é pública, estática e igual
 * para todos os clientes; nada nela é assinado pela InfinityPay.
 *
 * Enquanto a confirmação não vier da própria InfinityPay (webhook ou consulta
 * à API), quem ativa a assinatura é o painel administrativo.
 */

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { isPublicPlanCode, type PlanCode } from "@/lib/billing/plans";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import {
  hashIntentToken,
  shouldTrustCheckoutReturn,
  validateIntentForReturn,
  type IntentRejection,
} from "./checkout";

/** Postgres: relação inexistente — a migration do checkout não foi aplicada. */
const UNDEFINED_TABLE = "42P01";

export type ConfirmReturnInput = {
  token: string;
  planCode: string;
};

export type ConfirmReturnResult =
  | {
      recognized: true;
      companyName: string;
      planCode: PlanCode;
      /** `true` quando a assinatura já ficou ativa; `false` quando aguarda conferência. */
      activated: boolean;
    }
  | {
      recognized: false;
      code: IntentRejection | "unavailable";
      message: string;
    };

type IntentRow = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  plan_code: string;
  status: string;
  expires_at: string;
};

export const confirmCheckoutReturn = createServerFn({ method: "POST" })
  .inputValidator((d: ConfirmReturnInput) => {
    if (!isPublicPlanCode(d?.planCode)) throw new Error("Plano inválido.");
    // Token é hexadecimal de 32 bytes. Qualquer outra coisa nem chega ao banco.
    if (typeof d?.token !== "string" || !/^[0-9a-f]{64}$/.test(d.token)) {
      throw new Error("Retorno de checkout inválido.");
    }
    return d;
  })
  .handler(async ({ data }): Promise<ConfirmReturnResult> => {
    const planCode = data.planCode as PlanCode;
    const db = asBillingDb(supabaseAdmin);
    const tokenHash = await hashIntentToken(data.token);

    const { data: found, error } = await db
      .from("checkout_intents")
      .select("id, company_id, subscription_id, plan_code, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if ((error as { code?: string } | null)?.code === UNDEFINED_TABLE) {
      console.warn("[checkout] tabela checkout_intents ausente: migration não aplicada.");
      return {
        recognized: false,
        code: "unavailable",
        message: "A confirmação automática ainda não está disponível. Fale com a equipe.",
      };
    }

    const intent = (found ?? null) as IntentRow | null;

    // Já confirmada e do mesmo plano: quase sempre é o aviso de pagamento
    // (webhook) da InfinityPay, que roda em paralelo e pode terminar antes de
    // o cliente ser trazido de volta pra esta tela. Não é reuso suspeito — é
    // o caminho automático já tendo funcionado. Tratar isso como recusa
    // assustaria quem, na verdade, já está com a assinatura ativa.
    if (intent && intent.status === "confirmed" && intent.plan_code === planCode) {
      return reportAlreadyConfirmed(intent, planCode);
    }

    const verdict = validateIntentForReturn(
      intent && {
        planCode: intent.plan_code,
        status: intent.status,
        expiresAt: intent.expires_at,
      },
      planCode,
    );

    if (!verdict.ok || !intent) {
      // Recusa registrada: uma tentativa de usar a URL de retorno sem intenção
      // válida é justamente o que vale a pena enxergar depois.
      console.warn(
        `[checkout] retorno recusado (${verdict.ok ? "sem intenção" : verdict.code}) no plano ${planCode}.`,
      );
      return {
        recognized: false,
        code: verdict.ok ? "not_found" : verdict.code,
        message: verdict.ok ? "Checkout não encontrado." : verdict.message,
      };
    }

    // Sem confirmação da InfinityPay, ativar é uma decisão de risco explícita
    // de quem opera — ver shouldTrustCheckoutReturn.
    const trustReturn = shouldTrustCheckoutReturn(process.env);
    const nowIso = new Date().toISOString();

    // Marca a intenção usada. A condição sobre o status é o que impede duas
    // abas, ou um recarregamento, de registrarem o retorno duas vezes.
    const { data: claimed } = await db
      .from("checkout_intents")
      .update({
        status: trustReturn ? "confirmed" : "returned",
        returned_at: nowIso,
        confirmed_at: trustReturn ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", intent.id)
      .eq("status", intent.status)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      // Ninguém mais tinha essa intenção com este status um instante atrás,
      // na leitura acima — mas o aviso de pagamento pode ter reivindicado
      // ela bem no meio desta chamada. Reconfere antes de recusar: se agora
      // está confirmada, é a mesma boa notícia do caso de cima, só que
      // chegou uma fração de segundo mais tarde.
      const { data: recheck } = await db
        .from("checkout_intents")
        .select("id, company_id, subscription_id, plan_code, status, expires_at")
        .eq("id", intent.id)
        .maybeSingle();
      const recheckedIntent = recheck as IntentRow | null;

      if (recheckedIntent?.status === "confirmed" && recheckedIntent.plan_code === planCode) {
        return reportAlreadyConfirmed(recheckedIntent, planCode);
      }

      return {
        recognized: false,
        code: "already_used",
        message: "Este pagamento já foi registrado.",
      };
    }

    if (intent.subscription_id) {
      const nextStatus = trustReturn ? "active" : "pending_payment";

      await db
        .from("subscriptions")
        .update(
          trustReturn
            ? {
                status: nextStatus,
                activated_at: nowIso,
                // O ciclo passa a ser ancorado no dia da ativação.
                billing_anchor_day: new Date(nowIso).getUTCDate(),
                payment_provider: "infinitypay",
                updated_at: nowIso,
              }
            : { status: nextStatus, payment_provider: "infinitypay", updated_at: nowIso },
        )
        .eq("id", intent.subscription_id);

      await db.from("subscription_events").insert({
        subscription_id: intent.subscription_id,
        company_id: intent.company_id,
        event_type: trustReturn ? "checkout_return_activated" : "checkout_returned",
        new_status: nextStatus,
        reason: trustReturn
          ? "Retorno do checkout com ativação automática habilitada"
          : "Cliente retornou do checkout da InfinityPay; aguarda conferência do pagamento",
        metadata: {
          plan_code: planCode,
          checkout_intent_id: intent.id,
          // Registrado explicitamente: este evento não é confirmação de
          // pagamento pelo provedor.
          provider_confirmed: false,
        },
      });
    }

    if (trustReturn) {
      await supabaseAdmin
        .from("pizzerias")
        .update({ subscription_status: "active" })
        .eq("id", intent.company_id);

      // Onboarding concluído: pagamento aceito e estabelecimento criado. Este
      // é o momento de o cardápio nascer, sem o cliente pedir nada.
      //
      // Esperamos terminar. Nos Workers, promessa solta é descartada quando a
      // resposta sai — e o provisionamento morreria antes da primeira
      // gravação. A chamada tem prazo de 20s e nunca lança.
      await provisionAndForget(intent.company_id);
    }

    const { data: companyRow } = await supabaseAdmin
      .from("pizzerias")
      .select("name")
      .eq("id", intent.company_id)
      .maybeSingle();
    const companyName = (companyRow as { name?: string } | null)?.name ?? "seu estabelecimento";

    return { recognized: true, companyName, planCode, activated: trustReturn };
  });

/** Monta a resposta de sucesso para uma intenção que já estava confirmada. */
async function reportAlreadyConfirmed(
  intent: IntentRow,
  planCode: PlanCode,
): Promise<ConfirmReturnResult> {
  const { data: companyRow } = await supabaseAdmin
    .from("pizzerias")
    .select("name")
    .eq("id", intent.company_id)
    .maybeSingle();
  const companyName = (companyRow as { name?: string } | null)?.name ?? "seu estabelecimento";

  return { recognized: true, companyName, planCode, activated: true };
}

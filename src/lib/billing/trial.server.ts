/**
 * Concessão do período gratuito. Servidor apenas.
 *
 * Este módulo NÃO decide nada: ele só chama a função `start_free_trial`, que
 * vive dentro do banco. A decisão fica lá de propósito.
 *
 * O motivo é simples: se "pode ganhar 30 dias?" fosse uma pergunta respondida
 * pelo aplicativo, bastaria alguém repetir a chamada de cadastro para ganhar
 * mais 30 dias, e outros 30, e assim por diante. Dentro do banco a resposta é
 * dada por um índice único — o caderno de reservas que só aceita um nome por
 * mesa. Não adianta insistir: a caneta trava.
 *
 * A mesma função também abre o ciclo gratuito e registra o evento, tudo numa
 * transação só. Ou acontece inteiro, ou não acontece.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";
import { TRIAL_DURATION_DAYS } from "./trial";

export type GrantTrialResult =
  | {
      granted: true;
      /** `true` quando o período já tinha sido concedido nesta assinatura. */
      alreadyGranted: boolean;
      trialStartedAt: string;
      trialEndsAt: string;
    }
  | { granted: false; reason: TrialDenialReason };

export type TrialDenialReason =
  | "trial_already_used"
  | "subscription_not_found"
  | "subscription_not_eligible"
  | "company_not_found"
  | "missing_email"
  | "billing_not_installed"
  | "rpc_failed";

/** Postgres: função inexistente — a migration do período grátis não foi aplicada. */
const UNDEFINED_FUNCTION = "42883";

export const TRIAL_DENIAL_MESSAGES: Record<TrialDenialReason, string> = {
  trial_already_used: "Este e-mail ou documento já utilizou o período gratuito.",
  subscription_not_found: "Assinatura não encontrada para liberar o período gratuito.",
  subscription_not_eligible: "Esta assinatura não está em um estado que aceite período gratuito.",
  company_not_found: "Estabelecimento não encontrado para liberar o período gratuito.",
  missing_email: "É necessário um e-mail para registrar o período gratuito.",
  billing_not_installed: "O período gratuito ainda não está configurado nesta instalação.",
  rpc_failed: "Não foi possível liberar o período gratuito agora.",
};

function isDenialReason(value: unknown): value is TrialDenialReason {
  return typeof value === "string" && value in TRIAL_DENIAL_MESSAGES;
}

/**
 * Libera os 30 dias para uma assinatura recém-criada.
 *
 * NUNCA lança: um cadastro não pode falhar porque o brinde não pôde ser
 * concedido. Quando a concessão é negada, a conta continua existindo e quem
 * chamou decide o que mostrar.
 */
export async function grantFreeTrial(input: {
  subscriptionId: string;
  ownerEmail: string;
  document?: string | null;
  durationDays?: number;
}): Promise<GrantTrialResult> {
  try {
    const { data, error } = await asBillingDb(supabaseAdmin).rpc("start_free_trial", {
      p_subscription_id: input.subscriptionId,
      p_owner_email: input.ownerEmail,
      p_document: input.document ?? null,
      p_duration_days: input.durationDays ?? TRIAL_DURATION_DAYS,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === UNDEFINED_FUNCTION) {
        console.warn("[trial] migration do período grátis não aplicada neste banco.");
        return { granted: false, reason: "billing_not_installed" };
      }
      console.error("[trial] falha ao conceder o período grátis:", error);
      return { granted: false, reason: "rpc_failed" };
    }

    const result = (data ?? {}) as {
      granted?: boolean;
      already_granted?: boolean;
      reason?: string;
      trial_started_at?: string;
      trial_ends_at?: string;
    };

    if (!result.granted) {
      const reason = isDenialReason(result.reason) ? result.reason : "rpc_failed";
      console.warn(`[trial] período grátis não concedido (${reason}) para ${input.subscriptionId}`);
      return { granted: false, reason };
    }

    return {
      granted: true,
      alreadyGranted: !!result.already_granted,
      trialStartedAt: String(result.trial_started_at ?? ""),
      trialEndsAt: String(result.trial_ends_at ?? ""),
    };
  } catch (err) {
    console.error("[trial] erro inesperado ao conceder o período grátis:", err);
    return { granted: false, reason: "rpc_failed" };
  }
}

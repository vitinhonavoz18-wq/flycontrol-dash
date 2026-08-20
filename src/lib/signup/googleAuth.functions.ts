/**
 * O que fazer depois que alguém entra com o Google. Servidor apenas.
 *
 * Só lê o que já existe e devolve um veredito — "é gente nova", "já tem
 * estabelecimento mas não pagou" ou "pode entrar". Quem cria estabelecimento,
 * assinatura ou qualquer outra coisa é sempre o cadastro normal
 * (`createAccount`, em signup.functions.ts), pelo mesmo caminho de sempre.
 * Entrar com o Google, sozinho, nunca cria nada.
 */

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type GoogleAuthState =
  | { status: "ready" }
  | { status: "pending_payment" }
  | {
      status: "new";
      profile: { fullName: string; email: string; avatarUrl: string | null };
    };

export const resolveGoogleAuthState = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken: string }) => {
    if (!d?.accessToken) throw new Error("Sessão inválida. Entre novamente.");
    return d;
  })
  .handler(async ({ data }): Promise<GoogleAuthState> => {
    // O token vem do navegador, mas quem diz se ele é válido é o próprio
    // Supabase — nunca confiamos no e-mail ou id que o cliente alegar ter.
    const { data: userData, error } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (error || !userData?.user) {
      throw new Error("Sessão expirada. Entre novamente.");
    }
    const user = userData.user;

    const { data: pizzeria } = await supabaseAdmin
      .from("pizzerias")
      .select("subscription_status")
      .eq("owner_id", user.id)
      .neq("status", "deleted")
      .neq("status", "inactive")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (pizzeria) {
      // Já existe estabelecimento para este dono: nunca passa pelo cadastro
      // de novo. Se a assinatura ainda não está ativa, manda para a tela de
      // cobrança — que já mostra o "Pagar agora" — em vez de para o painel.
      return {
        status: pizzeria.subscription_status === "active" ? "ready" : "pending_payment",
      };
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = String(meta.full_name ?? meta.name ?? "");
    const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

    return {
      status: "new",
      profile: {
        fullName,
        email: user.email ?? "",
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
      },
    };
  });

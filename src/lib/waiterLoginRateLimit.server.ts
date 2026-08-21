/**
 * Freio de tentativas de login do garçom. Servidor apenas.
 *
 * A senha do garçom pode ter só 4 caracteres — combinação que um robô testa
 * inteira em poucos minutos. Contar as tentativas por endereço de internet é
 * o que transforma "testar tudo" em "não vale a pena": errou 10 vezes em 15
 * minutos, espera.
 *
 * Mesmo molde do freio do cadastro (`signup/rateLimit.server.ts`): a tabela
 * `waiter_login_attempts` não tem nenhuma regra de acesso, então só o
 * servidor lê e grava nela.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentRequestIp } from "@/lib/signup/rateLimit.server";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS_PER_WINDOW = 10;

type WaiterLoginAttemptsDb = {
  from: (table: "waiter_login_attempts") => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        gte: (
          column: string,
          value: string,
        ) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
    insert: (values: {
      ip_address: string;
      username: string | null;
    }) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Conta as tentativas recentes deste endereço e registra esta como mais uma —
 * inclusive quando já está bloqueado, para não dar uma tentativa extra de
 * graça a cada chamada.
 *
 * Falha de banco nunca tranca o portal: um erro na contagem deixa passar e
 * registra no log. Melhor um login a mais do que a loja inteira sem garçom.
 */
export async function checkAndRecordWaiterLoginAttempt(
  username: string,
): Promise<{ allowed: boolean }> {
  try {
    const ip = currentRequestIp();
    const db = supabaseAdmin as unknown as WaiterLoginAttemptsDb;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const { count } = await db
      .from("waiter_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", since);

    await db
      .from("waiter_login_attempts")
      .insert({ ip_address: ip, username: username.slice(0, 60) || null });

    return { allowed: (count ?? 0) < MAX_ATTEMPTS_PER_WINDOW };
  } catch (err) {
    console.error("[waiter-login] falha ao contar tentativas:", err);
    return { allowed: true };
  }
}

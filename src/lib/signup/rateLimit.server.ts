/**
 * Limite de tentativas de cadastro por IP. Servidor apenas.
 *
 * Sem isso, um script poderia criar cadastros repetidamente sem parar, cada
 * um gerando um link de pagamento real na InfinityPay. Não impede um
 * abusador determinado a trocar de IP, mas barra o caso comum — um script
 * simples batendo no mesmo endereço sem parar.
 */

import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_ATTEMPTS_PER_WINDOW = 5;

/**
 * `signup_attempts` não está em `integrations/supabase/types.ts` porque os
 * tipos são gerados a partir do banco e esta migration é recente. Mesmo
 * molde usado em `useUpdateOrderStatus.ts` para `order_status_history`: o
 * cast some quando os tipos forem regerados.
 */
type SignupAttemptsDb = {
  from: (table: "signup_attempts") => {
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
    insert: (values: { ip_address: string }) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * IP de quem está fazendo a requisição.
 *
 * `cf-connecting-ip` é o cabeçalho que a própria borda da Cloudflare grava —
 * o cliente não consegue forjar esse valor, porque a Cloudflare sobrescreve
 * qualquer coisa que ele mande com esse nome. `getRequestIP` é o
 * complemento (útil fora da Cloudflare, como em desenvolvimento local).
 */
export function currentRequestIp(): string {
  return getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

/**
 * Confere quantas tentativas esse IP já fez na última hora e registra esta
 * como mais uma — inclusive quando `allowed` sai `false`, para não dar a
 * quem está sendo bloqueado uma tentativa extra grátis a cada chamada.
 */
export async function checkAndRecordSignupAttempt(ip: string): Promise<{ allowed: boolean }> {
  const db = supabaseAdmin as unknown as SignupAttemptsDb;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await db
    .from("signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", since);

  await db.from("signup_attempts").insert({ ip_address: ip });

  return { allowed: (count ?? 0) < MAX_ATTEMPTS_PER_WINDOW };
}

/**
 * Contador genérico de tentativas FALHAS, guardado na mesma tabela do
 * cadastro com um prefixo na chave (ex.: "garcom-login:ip:1.2.3.4") para não
 * misturar com os IPs do cadastro.
 *
 * Diferente do cadastro, aqui só a falha conta: o garçom que acerta a senha
 * não gasta tentativa. É o cofre que só trava depois de vários números
 * errados seguidos — quem sabe o segredo abre sempre.
 */
export async function contarFalhasRecentes(chave: string, janelaMs: number): Promise<number> {
  const db = supabaseAdmin as unknown as SignupAttemptsDb;
  const since = new Date(Date.now() - janelaMs).toISOString();
  const { count, error } = await db
    .from("signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", chave)
    .gte("created_at", since);
  // Se a contagem falhar, não travamos o garçom no meio do expediente: a
  // senha continua sendo conferida normalmente.
  if (error) return 0;
  return count ?? 0;
}

export async function registrarFalha(chave: string): Promise<void> {
  const db = supabaseAdmin as unknown as SignupAttemptsDb;
  await db.from("signup_attempts").insert({ ip_address: chave });
}

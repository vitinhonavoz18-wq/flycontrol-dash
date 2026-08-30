/**
 * Confere quem está chamando um endpoint HTTP simples (`createFileRoute`),
 * fora do pipeline de server functions do TanStack Start — por isso não dá
 * para reaproveitar o middleware `requireSupabaseAuth` diretamente aqui.
 *
 * A checagem de administrador usa a mesma função `is_admin()` que as
 * políticas de RLS do banco usam, para a verificação da aplicação nunca
 * divergir da verificação do banco.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseEnv } from "./env";

export type AuthedCaller = {
  userId: string;
  supabase: ReturnType<typeof createClient<Database>>;
};

function unauthorized(cors: Record<string, string>, status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Extrai e valida o Bearer token, devolvendo um cliente autenticado como o usuário. */
export async function requireBearerCaller(
  request: Request,
  cors: Record<string, string>,
): Promise<AuthedCaller> {
  const env = resolveSupabaseEnv(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    url: "SUPABASE_URL",
    key: "SUPABASE_PUBLISHABLE_KEY",
  });
  if (!env.ok) {
    console.error(`[Supabase] ${env.message}`);
    throw unauthorized(cors, 500, "server_misconfigured");
  }

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw unauthorized(cors, 401, "unauthorized");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw unauthorized(cors, 401, "unauthorized");
  }

  const supabase = createClient<Database>(env.url, env.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw unauthorized(cors, 401, "unauthorized");
  }

  return { userId: String(data.claims.sub), supabase };
}

/** Só passa quem é administrador global da plataforma. */
export async function requireGlobalAdmin(
  request: Request,
  cors: Record<string, string>,
): Promise<AuthedCaller> {
  const caller = await requireBearerCaller(request, cors);
  const { data: isAdmin, error } = await caller.supabase.rpc("is_admin");
  if (error || !isAdmin) {
    throw unauthorized(cors, 403, "forbidden");
  }
  return caller;
}

/**
 * Só passa quem tem a chave específica daquela ação.
 *
 * Antes, todo endereço sensível perguntava apenas "você é administrador?" — e
 * administrador podia tudo. Agora cada porta pede a chave dela: quem cuida do
 * suporte não abre a porta do financeiro, e quem cuida do financeiro não apaga
 * conta de cliente.
 *
 * Quem é super_admin continua abrindo todas — a função `tem_permissao` no
 * banco responde sim para ele em qualquer chave. Ou seja: nada do que já
 * funcionava para o dono da plataforma para de funcionar.
 */
export async function requirePermission(
  request: Request,
  cors: Record<string, string>,
  permissao: string,
): Promise<AuthedCaller> {
  const caller = await requireBearerCaller(request, cors);
  const { data: pode, error } = await caller.supabase.rpc("tem_permissao", {
    p_permissao: permissao,
  });
  if (error || !pode) {
    console.warn(`[permissao] ${caller.userId} tentou usar "${permissao}" sem ter a chave.`);
    throw unauthorized(cors, 403, "forbidden");
  }
  return caller;
}

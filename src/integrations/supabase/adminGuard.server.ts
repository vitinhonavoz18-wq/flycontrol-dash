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

/**
 * Só passa o dono daquela loja — ou o administrador da plataforma.
 *
 * POR QUE ISSO EXISTE
 *
 * Alguns endereços recebem o número da loja no corpo do pedido e trabalham com
 * a chave mestra do banco. Sem esta conferência, o número da loja vira a
 * própria senha: quem descobre um, mexe naquela loja.
 *
 * É o entregador que chega dizendo "sou da mesa 12" e a cozinha entrega sem
 * olhar. Aqui a cozinha olha: confere quem está pedindo e se aquela mesa é
 * mesmo dele.
 */
export async function requireOwnerOrAdmin(
  request: Request,
  cors: Record<string, string>,
  pizzeriaId: string,
  /** Cliente com chave mestra, para descobrir de quem é a loja. */
  admin: { from: (t: string) => any },
): Promise<AuthedCaller> {
  const caller = await requireBearerCaller(request, cors);

  const { data: loja } = await admin
    .from("pizzerias")
    .select("owner_id")
    .eq("id", pizzeriaId)
    .maybeSingle();

  if (loja && (loja as { owner_id: string | null }).owner_id === caller.userId) {
    return caller;
  }

  const { data: isAdmin } = await caller.supabase.rpc("is_admin");
  if (!isAdmin) {
    // Loja inexistente e loja de outro respondem igual: assim ninguém
    // descobre quais números de loja existem só testando um por um.
    throw unauthorized(cors, 403, "forbidden");
  }
  return caller;
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

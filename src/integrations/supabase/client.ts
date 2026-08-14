// Gerado automaticamente na origem, mas EDITADO: a leitura das variáveis passa
// por resolveSupabaseEnv, que tolera aspas, espaços e domínio sem esquema.
// Ver ./env.ts. Se este arquivo for regerado, reaplique a mudança — sem ela um
// espaço a mais no valor derruba a aplicação inteira.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseEnv } from "./env";
import { publicSupabaseConfig } from "./publicConfig";

function createSupabaseClient() {
  // Três fontes, nesta ordem:
  // 1. import.meta.env — gravado na compilação (funciona no desenvolvimento);
  // 2. o que o servidor entregou ao abrir a página (ver ./publicConfig.ts) —
  //    é o que salva o navegador quando a compilação saiu sem as VITE_*;
  // 3. process.env — usado quando o próprio servidor monta a página.
  const injected = publicSupabaseConfig();
  const rawUrl = import.meta.env.VITE_SUPABASE_URL || injected?.url || process.env.SUPABASE_URL;
  const rawKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    injected?.key ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  const env = resolveSupabaseEnv(rawUrl, rawKey, {
    url: "VITE_SUPABASE_URL",
    key: "VITE_SUPABASE_PUBLISHABLE_KEY",
  });

  if (!env.ok) {
    console.error(`[Supabase] ${env.message}`);
    throw new Error(env.message);
  }

  const { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY } = env;

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

// Gerado automaticamente na origem, mas EDITADO: a leitura das variáveis passa
// por resolveSupabaseEnv, que tolera aspas, espaços e domínio sem esquema.
// Ver ./env.ts. Se este arquivo for regerado, reaplique a mudança — sem ela um
// espaço a mais no valor derruba a aplicação inteira.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseEnv } from "./env";

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const rawUrl = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const rawKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

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

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function genKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "fc_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/create-pizzeria")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const name = String(body?.name ?? "").trim();
        const slug = String(body?.slug ?? "").trim().toLowerCase();
        const phone = String(body?.phone ?? "").trim();
        const address = String(body?.address ?? "").trim();
        if (!name || !slug) {
          return new Response(JSON.stringify({ error: "name e slug obrigatórios" }), { status: 400, headers: cors });
        }
        const { data: existing } = await supabaseAdmin
          .from("pizzerias").select("id, api_key").eq("slug", slug).maybeSingle();
        if (existing) {
          return new Response(JSON.stringify({ tenant_id: existing.id, api_key: existing.api_key }), { status: 200, headers: cors });
        }
        const api_key = genKey();
        const { data, error } = await supabaseAdmin
          .from("pizzerias")
          .insert({ name, slug, phone, address, api_key, status: "active" })
          .select("id, api_key").single();
        if (error || !data) {
          return new Response(JSON.stringify({ error: error?.message ?? "Falha ao criar" }), { status: 500, headers: cors });
        }
        return new Response(JSON.stringify({ tenant_id: data.id, api_key: data.api_key }), { status: 200, headers: cors });
      },
    },
  },
});

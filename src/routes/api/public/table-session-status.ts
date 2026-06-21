import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = (request?: Request) => ({
  "Access-Control-Allow-Origin": request?.headers.get("origin") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json",
});

async function resolveStatus(params: {
  session_id?: string | null;
  restaurant_slug?: string | null;
  table_number?: string | null;
}) {
  const { session_id, restaurant_slug, table_number } = params;

  if (session_id) {
    const { data, error } = await supabaseAdmin
      .from("table_sessions")
      .select("id, status, closed_at, restaurant_id, table_number, opened_at")
      .eq("id", session_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false as const };
    return { found: true as const, session: data };
  }

  if (!restaurant_slug || !table_number) {
    return { found: false as const, error: "missing_params" as const };
  }

  const { data: pz } = await supabaseAdmin
    .from("pizzerias")
    .select("id")
    .eq("slug", restaurant_slug)
    .neq("status", "deleted")
    .maybeSingle();
  if (!pz) return { found: false as const, error: "invalid_restaurant" as const };

  const { data, error } = await supabaseAdmin
    .from("table_sessions")
    .select("id, status, closed_at, restaurant_id, table_number, opened_at")
    .eq("restaurant_id", pz.id)
    .eq("table_number", String(table_number))
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { found: false as const };
  return { found: true as const, session: data };
}

export const Route = createFileRoute("/api/public/table-session-status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request) }),
      GET: async ({ request }) => {
        const headers = cors(request);
        try {
          const url = new URL(request.url);
          const result = await resolveStatus({
            session_id: url.searchParams.get("session_id"),
            restaurant_slug: url.searchParams.get("restaurant_slug"),
            table_number: url.searchParams.get("table_number"),
          });
          if (!result.found) {
            return new Response(
              JSON.stringify({ success: false, error: result.error || "not_found" }),
              { status: 404, headers },
            );
          }
          return new Response(
            JSON.stringify({ success: true, session: result.session }),
            { status: 200, headers },
          );
        } catch (err: any) {
          console.error("❌ TABLE_SESSION_STATUS_ERROR:", err?.message);
          return new Response(
            JSON.stringify({ success: false, error: "server_error" }),
            { status: 500, headers },
          );
        }
      },
      POST: async ({ request }) => {
        const headers = cors(request);
        try {
          const body = await request.json().catch(() => ({}));
          const result = await resolveStatus({
            session_id: body?.session_id ?? null,
            restaurant_slug: body?.restaurant_slug ?? null,
            table_number: body?.table_number ?? null,
          });
          if (!result.found) {
            return new Response(
              JSON.stringify({ success: false, error: result.error || "not_found" }),
              { status: 404, headers },
            );
          }
          return new Response(
            JSON.stringify({ success: true, session: result.session }),
            { status: 200, headers },
          );
        } catch (err: any) {
          console.error("❌ TABLE_SESSION_STATUS_ERROR:", err?.message);
          return new Response(
            JSON.stringify({ success: false, error: "server_error" }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});

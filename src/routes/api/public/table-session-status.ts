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

const SELECT = "id, dining_session_id, customer_token, status, closed_at, restaurant_id, table_number, table_name, opened_at, subtotal_amount, service_fee_amount, total_amount";

async function resolveStatus(params: {
  dining_session_id?: string | null;
  customer_token?: string | null;
  session_id?: string | null;
  restaurant_slug?: string | null;
  table_number?: string | null;
  legacy?: boolean;
}) {
  const { dining_session_id, customer_token, session_id, restaurant_slug, table_number } = params;

  // Preferred lookups: dining_session_id / customer_token.
  if (dining_session_id) {
    const { data, error } = await supabaseAdmin
      .from("table_sessions").select(SELECT)
      .eq("dining_session_id", dining_session_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false as const };
    return { found: true as const, session: data };
  }

  if (customer_token) {
    const { data, error } = await supabaseAdmin
      .from("table_sessions").select(SELECT)
      .eq("customer_token", customer_token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false as const };
    return { found: true as const, session: data };
  }

  // Legacy lookups (deprecated). Continue to accept during migration window.
  if (session_id) {
    console.warn("[TABLE_SESSION_STATUS_LEGACY] lookup by session_id — please migrate to dining_session_id");
    const { data, error } = await supabaseAdmin
      .from("table_sessions").select(SELECT)
      .eq("id", session_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false as const };
    return { found: true as const, session: data };
  }

  if (!restaurant_slug || !table_number) {
    return { found: false as const, error: "missing_params" as const };
  }

  console.warn("[TABLE_SESSION_STATUS_LEGACY] lookup by slug+table_number — please migrate to dining_session_id");
  const { data: pz } = await supabaseAdmin
    .from("pizzerias").select("id")
    .eq("slug", restaurant_slug)
    .neq("status", "deleted")
    .maybeSingle();
  if (!pz) return { found: false as const, error: "invalid_restaurant" as const };

  const { data, error } = await supabaseAdmin
    .from("table_sessions").select(SELECT)
    .eq("restaurant_id", pz.id)
    .eq("table_number", String(table_number))
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { found: false as const };
  return { found: true as const, session: data };
}

function respond(headers: Record<string, string>, result: any) {
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
}

export const Route = createFileRoute("/api/public/table-session-status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request) }),
      GET: async ({ request }) => {
        const headers = cors(request);
        try {
          const url = new URL(request.url);
          const result = await resolveStatus({
            dining_session_id: url.searchParams.get("dining_session_id"),
            customer_token: url.searchParams.get("customer_token"),
            session_id: url.searchParams.get("session_id"),
            restaurant_slug: url.searchParams.get("restaurant_slug"),
            table_number: url.searchParams.get("table_number"),
          });
          return respond(headers, result);
        } catch (err: any) {
          console.error("❌ TABLE_SESSION_STATUS_ERROR:", err?.message);
          return new Response(JSON.stringify({ success: false, error: "server_error" }), { status: 500, headers });
        }
      },
      POST: async ({ request }) => {
        const headers = cors(request);
        try {
          const body = await request.json().catch(() => ({}));
          const result = await resolveStatus({
            dining_session_id: body?.dining_session_id ?? null,
            customer_token: body?.customer_token ?? null,
            session_id: body?.session_id ?? null,
            restaurant_slug: body?.restaurant_slug ?? null,
            table_number: body?.table_number ?? null,
          });
          return respond(headers, result);
        } catch (err: any) {
          console.error("❌ TABLE_SESSION_STATUS_ERROR:", err?.message);
          return new Response(JSON.stringify({ success: false, error: "server_error" }), { status: 500, headers });
        }
      },
    },
  },
});

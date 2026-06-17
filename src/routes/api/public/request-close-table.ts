import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = (request?: Request) => ({
  "Access-Control-Allow-Origin": request?.headers.get("origin") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json",
});

export const Route = createFileRoute("/api/public/request-close-table")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request) }),
      POST: async ({ request }) => {
        const headers = cors(request);
        try {
          const body = await request.json().catch(() => ({}));
          const { restaurant_slug, table_number, table_token, session_id, customer_name } = body || {};

          if (!restaurant_slug || !table_number) {
            return new Response(
              JSON.stringify({ success: false, error: "missing_params", message: "restaurant_slug e table_number são obrigatórios" }),
              { status: 400, headers }
            );
          }

          const { data: pz, error: pErr } = await supabaseAdmin
            .from("pizzerias")
            .select("id, name, slug")
            .eq("slug", restaurant_slug)
            .neq("status", "deleted")
            .maybeSingle();
          if (pErr) throw pErr;
          if (!pz) {
            return new Response(
              JSON.stringify({ success: false, error: "invalid_restaurant", message: "Restaurante não encontrado" }),
              { status: 404, headers }
            );
          }

          // Resolve table (optional but helpful)
          let tableId: string | null = null;
          if (table_token) {
            const { data: t } = await supabaseAdmin
              .from("restaurant_tables")
              .select("id")
              .eq("restaurant_id", pz.id)
              .eq("public_token", table_token)
              .maybeSingle();
            tableId = t?.id || null;
          }
          if (!tableId) {
            const { data: t2 } = await supabaseAdmin
              .from("restaurant_tables")
              .select("id")
              .eq("restaurant_id", pz.id)
              .eq("table_number", String(table_number))
              .maybeSingle();
            tableId = t2?.id || null;
          }

          // Resolve open session if not provided
          let sessionId: string | null = session_id || null;
          let resolvedCustomer: string | null = customer_name || null;
          if (!sessionId) {
            const { data: s } = await supabaseAdmin
              .from("table_sessions")
              .select("id, customer_name")
              .eq("restaurant_id", pz.id)
              .eq("table_number", String(table_number))
              .eq("status", "open")
              .order("opened_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            sessionId = s?.id || null;
            if (!resolvedCustomer && s?.customer_name) resolvedCustomer = s.customer_name;
          }

          // Dedupe: if there is already a pending request for this session in the last 2 min, return it.
          if (sessionId) {
            const { data: existing } = await supabaseAdmin
              .from("table_close_requests")
              .select("id, status, requested_at")
              .eq("session_id", sessionId)
              .eq("status", "pending")
              .order("requested_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing) {
              return new Response(
                JSON.stringify({ success: true, status: "already_pending", request_id: existing.id }),
                { status: 200, headers }
              );
            }
          }

          const { data: inserted, error: iErr } = await supabaseAdmin
            .from("table_close_requests")
            .insert({
              restaurant_id: pz.id,
              table_id: tableId,
              table_number: String(table_number),
              session_id: sessionId,
              customer_name: resolvedCustomer,
              status: "pending",
            })
            .select("id, requested_at")
            .single();

          if (iErr) throw iErr;

          console.log("CLOSE_REQUEST_CREATED:", inserted.id, "table:", table_number, "restaurant:", pz.slug);

          return new Response(
            JSON.stringify({ success: true, status: "created", request_id: inserted.id, requested_at: inserted.requested_at }),
            { status: 201, headers }
          );
        } catch (err: any) {
          console.error("❌ REQUEST_CLOSE_TABLE_ERROR:", err?.message);
          return new Response(
            JSON.stringify({ success: false, error: "server_error", message: "Erro ao registrar pedido de fechamento" }),
            { status: 500, headers }
          );
        }
      },
    },
  },
});

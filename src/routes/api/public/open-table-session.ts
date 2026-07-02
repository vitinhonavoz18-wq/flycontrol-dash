import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, accept",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
};

/**
 * Contract:
 *   Request  { restaurant_slug, table_number, table_token, customer_name?, customer_phone? }
 *   Response { success, status: "created"|"already_open",
 *              table_session: {
 *                id, dining_session_id, customer_token,
 *                table_number, table_name, status,
 *                subtotal_amount, total_amount, opened_at
 *              } }
 *
 * `dining_session_id` and `customer_token` are the SiteCreatorFly-facing
 * persistent identity of the session. FlyControl is the source of truth.
 */
export const Route = createFileRoute("/api/public/open-table-session")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        const cors = getCorsHeaders(request);

        try {
          const body = await request.json();
          const {
            restaurant_slug,
            table_number,
            table_token,
            customer_name,
          } = body || {};

          console.log("OPEN_TABLE_SESSION_REQUEST:", { restaurant_slug, table_number, table_token });

          if (!restaurant_slug || !table_number || !table_token) {
            console.warn("⚠️ OPEN_TABLE_SESSION_BAD_REQUEST: Missing required fields");
            return new Response(JSON.stringify({
              success: false,
              error: "missing_params",
              message: "restaurant_slug, table_number e table_token são obrigatórios"
            }), { status: 400, headers: cors });
          }

          const { data: pz, error: pErr } = await supabaseAdmin
            .from("pizzerias")
            .select("id, name, slug, is_active, subscription_status, service_fee_percent")
            .eq("slug", restaurant_slug)
            .neq("status", "deleted")
            .maybeSingle();

          if (pErr) {
            console.error("❌ OPEN_TABLE_SESSION_DB_ERROR (pizzerias):", pErr.message);
            throw pErr;
          }
          if (!pz) {
            return new Response(JSON.stringify({
              success: false, error: "invalid_restaurant", message: "Restaurante não encontrado"
            }), { status: 404, headers: cors });
          }
          if (pz.is_active === false || pz.subscription_status === "suspended") {
            return new Response(JSON.stringify({
              success: false, error: "inactive_restaurant", message: "Este restaurante está temporariamente inativo"
            }), { status: 403, headers: cors });
          }

          const { data: table, error: tErr } = await supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_name, is_active")
            .eq("restaurant_id", pz.id)
            .eq("table_number", String(table_number))
            .eq("public_token", table_token)
            .eq("is_active", true)
            .maybeSingle();

          if (tErr) throw tErr;
          if (!table) {
            return new Response(JSON.stringify({
              success: false, error: "invalid_table", message: "Mesa inválida ou inativa"
            }), { status: 400, headers: cors });
          }

          // Reuse an existing ACTIVE session (aliased as 'open' in DB).
          const { data: existingSession } = await supabaseAdmin
            .from("table_sessions")
            .select("id, table_id, dining_session_id, customer_token, table_number, table_name, status, subtotal_amount, total_amount, opened_at")
            .eq("restaurant_id", pz.id)
            .eq("table_number", String(table_number))
            .in("status", ["open", "requested_close", "waiting_operator", "closing"])
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingSession) {
            // Ensure the reused session is linked to the real restaurant_tables row.
            if (!(existingSession as any).table_id && table?.id) {
              await supabaseAdmin
                .from("table_sessions")
                .update({ table_id: table.id } as any)
                .eq("id", (existingSession as any).id);
              (existingSession as any).table_id = table.id;
            }
            console.log("OPEN_TABLE_SESSION_FOUND_EXISTING:", existingSession.id,
              "dining:", (existingSession as any).dining_session_id,
              "table_id:", (existingSession as any).table_id);
            return new Response(JSON.stringify({
              success: true,
              status: "already_open",
              table_session: existingSession,
            }), { status: 200, headers: cors });
          }

          try {
            const { data: newSession, error: iErr } = await supabaseAdmin
              .from("table_sessions")
              .insert({
                restaurant_id: pz.id,
                table_id: table.id,
                table_number: String(table_number),
                table_name: table.table_name || `Mesa ${table_number}`,
                status: "open",
                subtotal_amount: 0,
                service_fee_enabled: false,
                service_fee_percent: Number((pz as any).service_fee_percent ?? 10),
                service_fee_amount: 0,
                total_amount: 0,
                customer_name: customer_name || null,
                opened_at: new Date().toISOString(),
              } as any)
              .select("id, table_id, dining_session_id, customer_token, table_number, table_name, status, subtotal_amount, total_amount, opened_at")
              .single();

            if (iErr) {
              if (iErr.code === "23505") {
                const { data: raceSession } = await supabaseAdmin
                  .from("table_sessions")
                  .select("id, table_id, dining_session_id, customer_token, table_number, table_name, status, subtotal_amount, total_amount, opened_at")
                  .eq("restaurant_id", pz.id)
                  .eq("table_number", String(table_number))
                  .in("status", ["open", "requested_close", "waiting_operator", "closing"])
                  .maybeSingle();
                if (raceSession) {
                  return new Response(JSON.stringify({
                    success: true, status: "already_open", table_session: raceSession,
                  }), { status: 200, headers: cors });
                }
              }
              throw iErr;
            }

            console.log(
              "OPEN_TABLE_SESSION_CREATED",
              "session:", newSession.id,
              "dining:", (newSession as any).dining_session_id,
              "token:", (newSession as any).customer_token?.slice(0, 6) + "…",
            );

            return new Response(JSON.stringify({
              success: true, status: "created", table_session: newSession,
            }), { status: 201, headers: cors });
          } catch (insertError: any) {
            if (insertError?.code === "23505") {
              const { data: finalSession } = await supabaseAdmin
                .from("table_sessions")
                .select("id, table_id, dining_session_id, customer_token, table_number, table_name, status, subtotal_amount, total_amount, opened_at")
                .eq("restaurant_id", pz.id)
                .eq("table_number", String(table_number))
                .in("status", ["open", "requested_close", "waiting_operator", "closing"])
                .maybeSingle();
              if (finalSession) {
                return new Response(JSON.stringify({
                  success: true, status: "already_open", table_session: finalSession,
                }), { status: 200, headers: cors });
              }
            }
            throw insertError;
          }
        } catch (error: any) {
          console.error("❌ OPEN_TABLE_SESSION_UNHANDLED_ERROR:", error?.message);
          return new Response(JSON.stringify({
            success: false, error: "server_error", message: "Erro interno ao abrir mesa"
          }), { status: 500, headers: cors });
        }
      },
    },
  },
});

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
            customer_phone 
          } = body;

          console.log("OPEN_TABLE_SESSION_REQUEST:", { restaurant_slug, table_number, table_token });

          if (!restaurant_slug || !table_number || !table_token) {
            console.warn("⚠️ OPEN_TABLE_SESSION_BAD_REQUEST: Missing required fields");
            return new Response(JSON.stringify({ 
              success: false, 
              error: "missing_params",
              message: "restaurant_slug, table_number e table_token são obrigatórios" 
            }), { status: 400, headers: cors });
          }

          // 1. Validar restaurante
          const { data: pz, error: pErr } = await supabaseAdmin
            .from("pizzerias")
            .select("id, name, slug, is_active, subscription_status")
            .eq("slug", restaurant_slug)
            .neq("status", "deleted")
            .maybeSingle();

          if (pErr) {
            console.error("❌ OPEN_TABLE_SESSION_DB_ERROR (pizzerias):", pErr.message);
            throw pErr;
          }

          if (!pz) {
            console.warn("⚠️ OPEN_TABLE_SESSION_INVALID_RESTAURANT:", restaurant_slug);
            return new Response(JSON.stringify({ 
              success: false, 
              error: "invalid_restaurant",
              message: "Restaurante não encontrado" 
            }), { status: 404, headers: cors });
          }

          if (pz.is_active === false || pz.subscription_status === "suspended") {
            console.warn("⚠️ OPEN_TABLE_SESSION_INACTIVE_RESTAURANT:", restaurant_slug);
            return new Response(JSON.stringify({ 
              success: false, 
              error: "inactive_restaurant",
              message: "Este restaurante está temporariamente inativo" 
            }), { status: 403, headers: cors });
          }

          // 2. Validar mesa
          console.log("OPEN_TABLE_SESSION_TABLE_VALIDATION:", { restaurant_id: pz.id, table_number, table_token });
          const { data: table, error: tErr } = await supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_name, is_active")
            .eq("restaurant_id", pz.id)
            .eq("table_number", String(table_number))
            .eq("public_token", table_token)
            .eq("is_active", true)
            .maybeSingle();

          if (tErr) {
            console.error("❌ OPEN_TABLE_SESSION_DB_ERROR (restaurant_tables):", tErr.message);
            throw tErr;
          }

          if (!table) {
            console.warn("⚠️ OPEN_TABLE_SESSION_INVALID_TABLE:", { table_number, table_token });
            return new Response(JSON.stringify({ 
              success: false, 
              error: "invalid_table",
              message: "Mesa inválida ou inativa" 
            }), { status: 400, headers: cors });
          }

          // 3. Verificar sessão aberta
          const { data: existingSession, error: sErr } = await supabaseAdmin
            .from("table_sessions")
            .select("id, table_number, status")
            .eq("restaurant_id", pz.id)
            .eq("table_number", String(table_number))
            .eq("status", "open")
            .maybeSingle();

          if (sErr) {
            console.error("❌ OPEN_TABLE_SESSION_DB_ERROR (table_sessions):", sErr.message);
            throw sErr;
          }

          if (existingSession) {
            console.log("OPEN_TABLE_SESSION_FOUND_EXISTING:", existingSession.id);
            return new Response(JSON.stringify({
              success: true,
              status: "already_open",
              table_session: {
                id: existingSession.id,
                table_number: existingSession.table_number,
                status: existingSession.status
              }
            }), { status: 200, headers: cors });
          }

          // 4. Criar nova sessão
          console.log("OPEN_TABLE_SESSION_CREATING for table:", table_number);
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
              service_fee_percent: 15,
              service_fee_amount: 0,
              total_amount: 0,
              customer_name: customer_name || null,
              opened_at: new Date().toISOString()
            })
            .select("id, restaurant_id, table_id, table_number, status, subtotal_amount, service_fee_amount, total_amount")
            .single();

          if (iErr) {
            console.error("❌ OPEN_TABLE_SESSION_INSERT_ERROR:", iErr.message);
            throw iErr;
          }

          console.log("OPEN_TABLE_SESSION_CREATED:", newSession.id);
          
          const responseBody = {
            success: true,
            status: "created",
            table_session: newSession
          };
          
          console.log("OPEN_TABLE_SESSION_RESPONSE:", JSON.stringify(responseBody));
          
          return new Response(JSON.stringify(responseBody), { status: 201, headers: cors });

        } catch (error: any) {
          console.error("❌ OPEN_TABLE_SESSION_UNHANDLED_ERROR:", error.message);
          return new Response(JSON.stringify({ 
            success: false, 
            error: "server_error",
            message: "Erro interno ao abrir mesa" 
          }), { status: 500, headers: cors });
        }
      },
    },
  },
});

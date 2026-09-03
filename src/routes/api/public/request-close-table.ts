import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publicCors } from "@/lib/server/http";
import { mensagemDoErro } from "@/lib/errors";

const cors = (request?: Request) => publicCors(request);

const DEAD_STATUSES = new Set(["closed", "archived"]);

/** A comanda, com os campos que este endereço consulta. */
type ComandaConsultada = {
  id: string;
  status: string;
  closed_at: string | null;
  restaurant_id: string;
  table_id: string | null;
  table_number: string | null;
  customer_name: string | null;
  dining_session_id: string;
  customer_token: string;
};

export const Route = createFileRoute("/api/public/request-close-table")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request) }),
      POST: async ({ request }) => {
        const headers = cors(request);
        try {
          const body = await request.json().catch(() => ({}));
          const {
            dining_session_id,
            customer_token,
            restaurant_slug,
            table_number,
            table_token,
            session_id, // legacy
            customer_name,
          } = body || {};

          // Preferred: resolve session by dining_session_id / customer_token
          let session: ComandaConsultada | null = null;

          const selectCols =
            "id, status, closed_at, restaurant_id, table_id, table_number, customer_name, dining_session_id, customer_token";

          if (dining_session_id) {
            const { data } = await supabaseAdmin
              .from("table_sessions")
              .select(selectCols)
              .eq("dining_session_id", dining_session_id)
              .maybeSingle();
            session = (data as ComandaConsultada | null) ?? null;
          } else if (customer_token) {
            const { data } = await supabaseAdmin
              .from("table_sessions")
              .select(selectCols)
              .eq("customer_token", customer_token)
              .maybeSingle();
            session = (data as ComandaConsultada | null) ?? null;
          } else {
            // Authoritative contract — no legacy lookup by session_id / slug+table_number.
            return new Response(
              JSON.stringify({
                success: false,
                error: "missing_dining_session",
                message:
                  "Informe dining_session_id (ou customer_token) emitido pelo FlyControl. Chame /api/public/open-table-session primeiro.",
              }),
              { status: 400, headers },
            );
          }

          // Reference for legacy body fields kept for logging only; not used for lookup.
          void session_id;
          void restaurant_slug;
          void table_number;

          if (!session) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "session_not_found",
                message: "Sessão não encontrada.",
              }),
              { status: 404, headers },
            );
          }

          if (DEAD_STATUSES.has(session.status)) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "session_closed",
                message: "Esta mesa já foi encerrada pelo restaurante.",
                closed_at: session.closed_at,
                dining_session_id: session.dining_session_id,
              }),
              { status: 409, headers },
            );
          }

          // Resolve table row. Prefer the session's own table_id (authoritative,
          // set by open-table-session). Fall back to public_token, then to
          // restaurant_id + table_number lookup. This guarantees the customer
          // INSERT carries the same table_id operator INSERTs (ensureCloseRequest)
          // rely on — critical for Dashboard notifications and downstream joins.
          let tableId: string | null = session.table_id ?? null;
          if (!tableId && table_token) {
            const { data: t } = await supabaseAdmin
              .from("restaurant_tables")
              .select("id")
              .eq("restaurant_id", session.restaurant_id)
              .eq("public_token", table_token)
              .maybeSingle();
            tableId = t?.id ?? null;
          }
          if (!tableId && session.table_number) {
            const { data: t2 } = await supabaseAdmin
              .from("restaurant_tables")
              .select("id")
              .eq("restaurant_id", session.restaurant_id)
              .eq("table_number", session.table_number)
              .maybeSingle();
            tableId = t2?.id ?? null;
          }

          // Dedupe pending request
          const { data: existing } = await supabaseAdmin
            .from("table_close_requests")
            .select("id, status, requested_at")
            .eq("session_id", session.id)
            .eq("status", "pending")
            .order("requested_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existing) {
            // Ensure the session is at least in REQUESTED_CLOSE
            if (session.status === "open") {
              await supabaseAdmin
                .from("table_sessions")
                .update({ status: "requested_close" })
                .eq("id", session.id)
                .eq("status", "open");
            }
            return new Response(
              JSON.stringify({
                success: true,
                status: "already_pending",
                request_id: existing.id,
                session_status: session.status === "open" ? "requested_close" : session.status,
                dining_session_id: session.dining_session_id,
              }),
              { status: 200, headers },
            );
          }

          // O pedido de fechamento não existe sem o número da mesa: é ele que
          // o painel usa para saber qual mesa chamar. Sem isso, o banco recusa
          // a gravação e o cliente recebia um erro sem explicação — agora
          // recebe o motivo.
          if (!session.table_number) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "missing_table_number",
                message: "Esta comanda está sem número de mesa. Chame o garçom.",
              }),
              { status: 409, headers },
            );
          }

          const { data: inserted, error: iErr } = await supabaseAdmin
            .from("table_close_requests")
            .insert({
              restaurant_id: session.restaurant_id,
              table_id: tableId,
              table_number: session.table_number,
              session_id: session.id,
              dining_session_id: session.dining_session_id,
              customer_token: session.customer_token,
              customer_name: customer_name || session.customer_name || null,
              status: "pending",
            })
            .select("id, requested_at")
            .single();

          if (iErr) throw iErr;

          // Transition session to REQUESTED_CLOSE (only if still ACTIVE/open).
          const { data: transitioned } = await supabaseAdmin
            .from("table_sessions")
            .update({ status: "requested_close" })
            .eq("id", session.id)
            .eq("status", "open")
            .select("status")
            .maybeSingle();

          const finalStatus = transitioned?.status ?? session.status;

          console.log(
            "CLOSE_REQUEST_CREATED:",
            inserted.id,
            "session:",
            session.id,
            "dining:",
            session.dining_session_id,
            "status:",
            finalStatus,
          );

          return new Response(
            JSON.stringify({
              success: true,
              status: "created",
              request_id: inserted.id,
              requested_at: inserted.requested_at,
              session_status: finalStatus,
              dining_session_id: session.dining_session_id,
            }),
            { status: 201, headers },
          );
        } catch (err) {
          console.error("❌ REQUEST_CLOSE_TABLE_ERROR:", mensagemDoErro(err));
          return new Response(
            JSON.stringify({
              success: false,
              error: "server_error",
              message: "Erro ao registrar pedido de fechamento",
            }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});

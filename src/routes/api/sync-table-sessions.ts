import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function normalizeTable(v: any) {
  if (!v) return "";
  let s = String(v).trim().toLowerCase().replace(/^mesa\s*/, "");
  if (/^\d$/.test(s)) s = s.padStart(2, "0");
  return s;
}

export const Route = createFileRoute("/api/sync-table-sessions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const { tenant_id } = await request.json();
          if (!tenant_id) {
            return new Response(JSON.stringify({ success: false, error: "missing_tenant_id" }), { status: 400, headers: cors });
          }

          console.log("SYNC_TABLE_SESSIONS_START tenant:", tenant_id);

          // 1. Open sessions for tenant
          const { data: sessions, error: sErr } = await supabaseAdmin
            .from("table_sessions")
            .select("id, table_number, service_fee_enabled, service_fee_percent, opened_at")
            .eq("restaurant_id", tenant_id)
            .eq("status", "open");
          if (sErr) throw sErr;

          // 2. Candidate orders for this tenant that look like mesa orders
          const { data: candidates, error: oErr } = await supabaseAdmin
            .from("orders")
            .select("id, table_number, total, created_at, order_type, service_mode, delivery_type, table_id, status")
            .eq("tenant_id", tenant_id)
            .not("table_number", "is", null)
            .neq("table_number", "")
            .not("status", "in", "(cancelado,deleted)");
          if (oErr) throw oErr;

          // 3. Existing links (avoid dup)
          const sessionIds = (sessions || []).map(s => s.id);
          let linkedSet = new Set<string>();
          if (sessionIds.length) {
            const { data: links } = await supabaseAdmin
              .from("table_session_orders")
              .select("order_id, table_session_id")
              .in("table_session_id", sessionIds);
            (links || []).forEach(l => linkedSet.add(`${l.table_session_id}:${l.order_id}`));
          }

          let linkedCount = 0;
          for (const sess of sessions || []) {
            const sessTable = normalizeTable(sess.table_number);
            const matching = (candidates || []).filter(o => {
              if (normalizeTable(o.table_number) !== sessTable) return false;
              // Order must have been created at/after session opened (avoid attaching ancient orders)
              if (sess.opened_at && o.created_at && new Date(o.created_at) < new Date(sess.opened_at)) return false;
              return true;
            });

            for (const o of matching) {
              if (linkedSet.has(`${sess.id}:${o.id}`)) continue;
              const { error: lErr } = await supabaseAdmin
                .from("table_session_orders")
                .insert({ table_session_id: sess.id, order_id: o.id });
              if (!lErr) {
                linkedCount++;
                console.log("SYNC_LINKED:", sess.id, "<-", o.id);
              } else if (lErr.code !== "23505") {
                console.error("SYNC_LINK_ERROR:", lErr.message);
              }
            }

            // Recalculate
            const { data: ordersInfo } = await supabaseAdmin
              .from("orders")
              .select("id, total, status")
              .in("id", (await supabaseAdmin
                .from("table_session_orders")
                .select("order_id")
                .eq("table_session_id", sess.id)).data?.map(r => r.order_id) || ["00000000-0000-0000-0000-000000000000"]);

            const subtotal = (ordersInfo || [])
              .filter(o => o.status !== "cancelado" && o.status !== "deleted")
              .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const fee = sess.service_fee_enabled ? subtotal * (Number(sess.service_fee_percent) || 10) / 100 : 0;
            const total = subtotal + fee;

            await supabaseAdmin.from("table_sessions").update({
              subtotal_amount: subtotal,
              service_fee_amount: fee,
              total_amount: total,
              updated_at: new Date().toISOString(),
            }).eq("id", sess.id);

            console.log("SYNC_RECALC", sess.id, "subtotal:", subtotal, "total:", total);
          }

          return new Response(JSON.stringify({
            success: true,
            sessions: sessions?.length || 0,
            linked: linkedCount,
          }), { status: 200, headers: cors });
        } catch (err: any) {
          console.error("SYNC_TABLE_SESSIONS_ERROR:", err.message);
          return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
        }
      },
    },
  },
});

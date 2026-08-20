import { createFileRoute } from "@tanstack/react-router";
import { requireGlobalAdmin } from "@/integrations/supabase/adminGuard.server";
import { reactivatePizzeria } from "@/lib/server/pizzeriaLifecycle.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/pizzerias/$id/reactivate")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(JSON.stringify({ success: true }), { status: 200, headers: cors }),

      POST: async ({ request, params }) => {
        const id = String(params.id || "").trim();
        if (!id) {
          return new Response(JSON.stringify({ error: "missing_id" }), {
            status: 400,
            headers: cors,
          });
        }

        let caller;
        try {
          caller = await requireGlobalAdmin(request, cors);
        } catch (guardResponse) {
          if (guardResponse instanceof Response) return guardResponse;
          throw guardResponse;
        }

        const result = await reactivatePizzeria(id, caller.userId);
        if (!result.success) {
          const status = result.error === "store_not_found" ? 404 : 500;
          return new Response(JSON.stringify({ success: false, error: result.error }), {
            status,
            headers: cors,
          });
        }
        return new Response(JSON.stringify({ success: true, warning: result.warning }), {
          status: 200,
          headers: cors,
        });
      },
    },
  },
});

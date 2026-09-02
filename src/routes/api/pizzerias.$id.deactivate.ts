import { createFileRoute } from "@tanstack/react-router";
import { requireGlobalAdmin } from "@/integrations/supabase/adminGuard.server";
import { deactivatePizzeria } from "@/lib/server/pizzeriaLifecycle.server";
import { adminCors } from "@/lib/server/http";

const cors = adminCors();

export const Route = createFileRoute("/api/pizzerias/$id/deactivate")({
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

        const result = await deactivatePizzeria(id, caller.userId);
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

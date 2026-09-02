import { createFileRoute } from "@tanstack/react-router";
import { requireGlobalAdmin } from "@/integrations/supabase/adminGuard.server";
import { deletePizzeriaPermanently } from "@/lib/server/pizzeriaLifecycle.server";
import { adminCors } from "@/lib/server/http";

const cors = adminCors();

export const Route = createFileRoute("/api/pizzerias/$id/delete")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(JSON.stringify({ success: true }), { status: 200, headers: cors }),

      // POST (não DELETE) porque precisa de corpo com a confirmação do nome
      // digitado, e nem todo client HTTP/proxy no meio do caminho garante
      // repassar corpo em requisições DELETE.
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

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // corpo vazio/; segue com confirmName vazio, que sempre falha a checagem
        }
        const confirmName = String(body?.confirmName ?? "");

        const result = await deletePizzeriaPermanently(id, caller.userId, confirmName);
        if (!result.success) {
          const status =
            result.error === "store_not_found" ? 404 : result.error === "name_mismatch" ? 400 : 500;
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

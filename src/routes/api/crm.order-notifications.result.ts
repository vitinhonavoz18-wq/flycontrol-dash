import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crmRpc } from "@/lib/crm/db";

/**
 * O n8n conta como foi a entrega de cada aviso de pedido.
 *
 *   Corpo: { "tenant_id", "token", "results": [
 *            { "notification_id": "...", "status": "sent" | "failed",
 *              "external_id": "...", "error": "..." } ] }
 *
 * Aviso que falhou volta para a fila e é tentado de novo (até 3 vezes). Só a
 * loja dona do aviso consegue marcá-lo: o banco confere o tenant junto.
 */

const cabecalhos = { "Content-Type": "application/json" };

type Resultado = {
  notification_id?: string;
  id?: string;
  status?: string;
  external_id?: string;
  error?: string;
};

export const Route = createFileRoute("/api/crm/order-notifications/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mestra = conferirChaveMestra(request);
        if (!mestra.ok) return respostaNegadaCrm(mestra);

        let corpo: Record<string, unknown>;
        try {
          corpo = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ success: false, error: "corpo_invalido" }), {
            status: 400,
            headers: cabecalhos,
          });
        }

        const loja = await autenticarLoja(corpo);
        if (!loja.ok) return respostaNegadaCrm(loja);

        const lista: Resultado[] = Array.isArray(corpo.results)
          ? (corpo.results as Resultado[])
          : [corpo as Resultado];

        let aplicados = 0;
        let ignorados = 0;

        for (const r of lista.slice(0, 100)) {
          const id = String(r.notification_id ?? r.id ?? "").trim();
          const status = String(r.status ?? "").trim();
          if (!id || (status !== "sent" && status !== "failed")) {
            ignorados++;
            continue;
          }

          const { data, error } = await crmRpc("registrar_resultado_aviso_de_pedido", {
            p_tenant_id: loja.tenantId,
            p_notification_id: id,
            p_status: status,
            p_external_id: r.external_id ? String(r.external_id) : null,
            p_error: r.error ? String(r.error).slice(0, 300) : null,
          });

          if (error) {
            console.error("[crm/order-notifications/result] falha:", error.message);
            ignorados++;
            continue;
          }
          if (data === true) aplicados++;
          else ignorados++;
        }

        return new Response(JSON.stringify({ success: true, aplicados, ignorados }), {
          status: 200,
          headers: cabecalhos,
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm, crmRpc } from "@/lib/crm/db";

/**
 * O n8n avisando o que aconteceu com cada mensagem que levou.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/outbox/result
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "...", "token": "...",
 *                "results": [ { "message_id": "...", "status": "sent",
 *                               "external_id": "..." },
 *                             { "message_id": "...", "status": "failed",
 *                               "error": "numero invalido" } ] }
 *
 * Avisar duas vezes não muda nada: mensagem já marcada como enviada continua
 * enviada. É o carimbo de "pago" na comanda — carimbar de novo não cobra de
 * novo.
 *
 * Este endereço também serve de SINAL DE VIDA: é por ele que a tela do
 * lojista sabe dizer "faz 3 horas que o WhatsApp não dá notícia".
 */

const cabecalhos = { "Content-Type": "application/json" };

type Resultado = {
  message_id?: string;
  id?: string;
  status?: string;
  external_id?: string;
  error?: string;
};

export const Route = createFileRoute("/api/crm/outbox/result")({
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

        // Aceita os dois formatos que um fluxo do n8n costuma produzir: uma
        // lista de resultados, ou um resultado solto. Exigir só um formato
        // faria o fluxo quebrar por um detalhe de montagem.
        const lista: Resultado[] = Array.isArray(corpo.results)
          ? (corpo.results as Resultado[])
          : [corpo as Resultado];

        let aplicados = 0;
        const ignorados: string[] = [];

        for (const r of lista.slice(0, 200)) {
          const id = String(r.message_id ?? r.id ?? "").trim();
          const status = String(r.status ?? "").trim();
          if (!id || (status !== "sent" && status !== "failed")) {
            if (id) ignorados.push(id);
            continue;
          }

          const { data, error } = await crmRpc("crm_record_outbox_result", {
            p_message_id: id,
            p_tenant_id: loja.tenantId,
            p_status: status,
            p_external_id: r.external_id ? String(r.external_id) : null,
            p_error: r.error ? String(r.error).slice(0, 500) : null,
          });

          if (error) {
            console.error("[crm/outbox/result] falha ao gravar resultado:", error.message);
            ignorados.push(id);
            continue;
          }
          if (data === true) aplicados++;
        }

        // Sinal de vida: chegou aviso, então o fluxo está de pé.
        await crm("crm_n8n_links")
          .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("tenant_id", loja.tenantId);

        return new Response(
          JSON.stringify({ success: true, aplicados, ignorados: ignorados.length }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

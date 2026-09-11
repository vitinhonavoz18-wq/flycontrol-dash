import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crmRpc } from "@/lib/crm/db";
import { extrairDaUazapi } from "@/lib/crm/uazapiEvento";

/**
 * O n8n entregando uma mensagem que o CLIENTE mandou no WhatsApp da loja.
 *
 * PARA CONFIGURAR NO N8N (um fluxo por restaurante)
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/inbox
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     {
 *                "tenant_id":   "<id da loja>",
 *                "token":       "<a senha daquela loja>",
 *                "phone":       "5571999999999",
 *                "message":     "texto que o cliente mandou",
 *                "name":        "nome do cliente (opcional)",
 *                "external_id": "id da mensagem no WhatsApp (recomendado)",
 *                "media_url":   "(opcional)",
 *                "media_type":  "(opcional)"
 *              }
 *
 * POR QUE O `external_id` IMPORTA
 *
 * É o número que o WhatsApp deu para aquela mensagem. Com ele, se o n8n
 * entregar o mesmo recado duas vezes (tentou de novo depois de uma queda de
 * internet), a mensagem aparece UMA vez na tela. Sem ele, o cliente parece
 * ter falado duas vezes — e o atendente responde duas vezes.
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/inbox")({
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

        // O fluxo do n8n pode repassar o evento da UAZAPI CRU, sem montar
        // nada. Isso é de propósito: quanto menos o fluxo precisar remontar,
        // menos lugar existe para ele errar — e um fluxo por loja significa
        // que um erro desses teria de ser corrigido loja por loja.
        const uaz = extrairDaUazapi(corpo);
        if (uaz?.ignorar) {
          // Mensagem que o próprio restaurante enviou, ou de grupo. Recusar
          // com erro faria o n8n tentar de novo para sempre; 200 diz
          // "recebi e não era para mim".
          return new Response(JSON.stringify({ success: true, ignorada: true }), {
            status: 200,
            headers: cabecalhos,
          });
        }

        const telefone = String(uaz?.telefone ?? corpo.phone ?? corpo.phone_e164 ?? "").replace(
          /[^0-9]/g,
          "",
        );
        if (!telefone) {
          return new Response(JSON.stringify({ success: false, error: "telefone_ausente" }), {
            status: 400,
            headers: cabecalhos,
          });
        }

        const texto = uaz?.texto ?? corpo.message ?? corpo.body ?? corpo.text ?? null;

        const { data, error } = await crmRpc("crm_receive_message", {
          p_tenant_id: loja.tenantId,
          p_phone_e164: telefone,
          p_body: texto === null ? null : String(texto),
          p_contact_name: uaz?.nome ?? (corpo.name ? String(corpo.name) : null),
          p_external_id: uaz?.externalId ?? (corpo.external_id ? String(corpo.external_id) : null),
          p_media_url: uaz?.mediaUrl ?? (corpo.media_url ? String(corpo.media_url) : null),
          p_media_type: uaz?.mediaType ?? (corpo.media_type ? String(corpo.media_type) : null),
        });

        if (error) {
          // A loja perdeu o CRM entre uma mensagem e outra (downgrade,
          // cancelamento). Responder 409 e não 500 é o que diz ao n8n
          // "pare de tentar", em vez de deixá-lo repetindo para sempre.
          if (String(error.message ?? "").includes("crm_nao_contratado")) {
            return new Response(JSON.stringify({ success: false, error: "crm_nao_contratado" }), {
              status: 409,
              headers: cabecalhos,
            });
          }
          console.error("[crm/inbox] falha ao gravar mensagem:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        const linha = (Array.isArray(data) ? data[0] : data) as
          { message_id: string; conversation_id: string; duplicada: boolean } | undefined;

        return new Response(
          JSON.stringify({
            success: true,
            message_id: linha?.message_id ?? null,
            conversation_id: linha?.conversation_id ?? null,
            duplicada: Boolean(linha?.duplicada),
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

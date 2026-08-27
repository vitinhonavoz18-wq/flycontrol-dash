import { createFileRoute } from "@tanstack/react-router";
import { autenticarN8n, respostaNegada } from "@/lib/marketing/n8nAuth";
import { mktRpc, mkt } from "@/lib/marketing/db";
import { obterProvedor } from "@/lib/marketing/whatsappGateway";

/**
 * Retorno de status vindo do WhatsApp (pelo n8n).
 *
 * A diferença para /api/marketing/queue/result: aquele é o n8n dizendo "eu
 * mandei"; este é o WhatsApp dizendo "chegou no celular da pessoa". Os dois
 * atualizam a mesma mensagem, e por isso os dois precisam ser à prova de
 * repetição e de chegada fora de ordem — o que o banco garante.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/webhooks/whatsapp-status
 *   Cabeçalho: Authorization: Bearer <MARKETING_N8N_SECRET>
 *   Corpo:     { "recipient_id": "...", "status": "delivered" }
 *              ou { "provider_message_id": "ABC123", "status": "read" }
 *
 * O n8n é quem traduz o formato da UAZAPI para este. É de propósito: assim,
 * trocar de fornecedor de WhatsApp amanhã não exige mexer no FlyControl —
 * mexe-se só no fluxo do n8n. É a mesma ideia da tomada: o aparelho muda, a
 * tomada continua.
 *
 * SOBRE A AUTENTICAÇÃO
 *
 * Este endereço também exige o segredo. Sem ele, qualquer pessoa que
 * descobrisse a URL poderia marcar mensagens como entregues e estragar o
 * relatório do restaurante — ou pior, marcar como falhadas e fazer o sistema
 * reenviar tudo, incomodando o cliente final.
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/webhooks/whatsapp-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = autenticarN8n(request);
        if (!auth.ok) return respostaNegada(auth);

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return new Response(JSON.stringify({ success: false, error: "corpo_invalido" }), {
            status: 400,
            headers: cabecalhos,
          });
        }

        const evento = obterProvedor().interpretarWebhook(corpo);
        if (!evento) {
          // Responder 200 aqui é deliberado: um corpo que não reconhecemos
          // não é culpa do fornecedor, e devolver erro faria ele reenviar o
          // mesmo aviso indefinidamente.
          return new Response(
            JSON.stringify({ success: true, ignorado: true, motivo: "sem_identificador" }),
            { status: 200, headers: cabecalhos },
          );
        }

        let recipientId = evento.recipientId;

        // Quando vem só o número que o fornecedor deu à mensagem, achamos a
        // linha por ele.
        if (!recipientId && evento.providerMessageId) {
          const { data } = await mkt("marketing_campaign_recipients")
            .select("id")
            .eq("provider_message_id", evento.providerMessageId)
            .limit(1)
            .maybeSingle();
          recipientId = data?.id;
        }

        if (!recipientId) {
          return new Response(
            JSON.stringify({ success: true, ignorado: true, motivo: "mensagem_desconhecida" }),
            { status: 200, headers: cabecalhos },
          );
        }

        const { data, error } = await mktRpc("marketing_record_result", {
          p_recipient_id: recipientId,
          p_status: evento.status,
          p_provider_message_id: evento.providerMessageId ?? null,
          p_error_code: evento.codigo ?? null,
          p_error_message: evento.erro ?? null,
        });

        if (error) {
          console.error("[webhooks/whatsapp-status] falha ao registrar:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        const linha = Array.isArray(data) ? data[0] : data;

        // Auditoria do que chegou. Sem token, sem chave — só o que é útil
        // para explicar depois o que aconteceu com aquela mensagem.
        try {
          await mkt("marketing_events").insert({
            recipient_id: recipientId,
            event: "webhook_received",
            payload: {
              status: evento.status,
              provider_message_id: evento.providerMessageId ?? null,
              aplicado: Boolean(linha?.aplicado),
            },
          });
        } catch {
          /* auditoria nunca derruba o retorno */
        }

        return new Response(JSON.stringify({ success: true, aplicado: Boolean(linha?.aplicado) }), {
          status: 200,
          headers: cabecalhos,
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { crmRpc } from "@/lib/crm/db";
import { tipoPeloWhatsApp, tipoPeloMime, ehTipoMidia } from "@/lib/crm/midia";
import { rotaDoCrm, respostaCrm, erroCrm, textoOpcional } from "@/lib/crm/rotaCrm";

/**
 * O fluxo VOLTANDO para contar o que entendeu do áudio ou da foto.
 *
 * POR QUE SÃO DUAS VIAGENS, E NÃO UMA
 *
 * Quando o cliente manda um áudio, o WhatsApp avisa na hora, mas o som ainda
 * está guardado do lado de lá. Se o painel esperasse a transcrição para
 * registrar a mensagem, o lojista ficaria 20 segundos sem ver nada e depois a
 * mensagem apareceria "do passado". Então:
 *
 *   1ª viagem (/api/crm/inbox) — "chegou um ÁUDIO deste cliente, agora".
 *      A mensagem já nasce e o balão aparece na tela dizendo "Áudio".
 *   2ª viagem (aqui) ........... "o áudio dizia: quero duas pizzas".
 *      O mesmo balão passa a mostrar o que foi dito.
 *
 * O TEXTO DO CLIENTE NUNCA É APAGADO. Se a mensagem já tinha legenda escrita,
 * a legenda fica e a transcrição não entra por cima. Uma transcrição que apaga
 * o que a pessoa escreveu é pior que transcrição nenhuma.
 *
 * PARA O N8N
 *   POST https://<dominio>/api/crm/message-media
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   {
 *     "tenant_id": "...", "token": "...",
 *     "external_id": "<o messageid do WhatsApp>",
 *     "transcricao": "quero duas pizzas",
 *     "media_type": "audio",
 *     "media_url": "(opcional)"
 *   }
 */

export const Route = createFileRoute("/api/crm/message-media")({
  server: {
    handlers: {
      POST: rotaDoCrm("message-media", async ({ tenantId, corpo }) => {
        const externalId = textoOpcional(
          corpo.external_id ?? corpo.externalId ?? corpo.messageid,
          200,
        );
        if (!externalId) {
          return erroCrm(
            "external_id_ausente",
            400,
            "Informe o external_id (o messageid do WhatsApp) da mensagem.",
          );
        }

        // A transcrição pode ser longa — um áudio de dois minutos vira muito
        // texto —, mas não pode ser infinita: um balão de 10 mil letras quebra
        // a leitura da conversa.
        const transcricao = textoOpcional(
          corpo.transcricao ?? corpo.texto ?? corpo.text ?? corpo.descricao,
          4000,
        );

        const tipoBruto = corpo.media_type ?? corpo.tipo ?? corpo.mimetype;
        const tipo =
          (ehTipoMidia(tipoBruto) ? tipoBruto : null) ??
          tipoPeloWhatsApp(tipoBruto) ??
          tipoPeloMime(tipoBruto);

        const { data, error } = await crmRpc("crm_attach_media", {
          p_tenant_id: tenantId,
          p_external_id: externalId,
          p_media_url: textoOpcional(corpo.media_url ?? corpo.fileURL, 2000),
          p_media_type: tipo,
          p_transcricao: transcricao,
        });

        if (error) throw new Error(error.message);

        const linha = (Array.isArray(data) ? data[0] : data) as
          | { message_id: string | null; conversation_id: string | null; atualizada: boolean }
          | undefined;

        // Mensagem não encontrada NÃO é erro: pode ser um evento repetido, ou
        // a mensagem que ainda não terminou de ser gravada. Devolver erro faria
        // o fluxo tentar para sempre.
        return respostaCrm({
          success: true,
          encontrada: Boolean(linha?.atualizada),
          message_id: linha?.message_id ?? null,
          conversation_id: linha?.conversation_id ?? null,
        });
      }),
    },
  },
});

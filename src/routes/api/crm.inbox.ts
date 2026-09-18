import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm, crmRpc } from "@/lib/crm/db";
import { configUazapi } from "@/lib/whatsapp/uazapi";
import { extrairDaUazapi } from "@/lib/crm/uazapiEvento";
import { tipoPeloWhatsApp } from "@/lib/crm/midia";

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
 *                "from_me":     true quando foi o DONO quem digitou (opcional),
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
 *
 * A RESPOSTA DEVOLVE A CREDENCIAL DO APARELHO, em `uazapi`, igual à fila de
 * saída. É o que permite o fluxo BAIXAR o áudio ou a foto que acabou de
 * chegar, para transcrever. Sem isso o fluxo ficava com o recado na mão e sem
 * a chave do armário onde o arquivo estava guardado — e era exatamente esse o
 * defeito: áudio chegava, ninguém ouvia, ninguém respondia.
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
          // Mensagem de grupo ou de transmissão. Recusar com erro faria o n8n
          // tentar de novo para sempre; 200 diz "recebi e não era para mim".
          return new Response(JSON.stringify({ success: true, ignorada: true }), {
            status: 200,
            headers: cabecalhos,
          });
        }

        // Quem digitou: o cliente ou o próprio dono, no celular dele?
        // Isso decide de que lado a mensagem aparece na tela E se o nome que
        // veio junto pode ser usado — numa mensagem do dono, o nome que vem é
        // o do perfil DA LOJA.
        const doRestaurante =
          uaz?.fromMe === true || corpo.from_me === true || corpo.fromMe === true;

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
          p_contact_name: doRestaurante
            ? null
            : (uaz?.nome ?? (corpo.name ? String(corpo.name) : null)),
          p_from_me: doRestaurante,
          p_external_id: uaz?.externalId ?? (corpo.external_id ? String(corpo.external_id) : null),
          p_media_url: uaz?.mediaUrl ?? (corpo.media_url ? String(corpo.media_url) : null),
          // O TIPO É NORMALIZADO ANTES DE ENTRAR. A UAZAPI escreve a mesma
          // coisa de várias formas ("ptt", "audioMessage", "AudioMessage"), e
          // "conversation" — que é mensagem de texto comum — não pode virar
          // arquivo nenhum. Sem essa tradução, o balão do áudio chegava em
          // branco na tela e o lojista não tinha como saber que alguém falou.
          p_media_type: tipoPeloWhatsApp(uaz?.mediaType ?? corpo.media_type ?? corpo.tipo) ?? null,
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

        // A CHAVE DO ARMÁRIO, junto com o recado.
        //
        // Quando o cliente manda um áudio, o WhatsApp não entrega o som: ele
        // entrega um bilhete dizendo "tem um áudio guardado ali". Para pegar o
        // arquivo é preciso a credencial do aparelho da loja — a mesma que a
        // fila de saída já devolve. Sem ela, o fluxo ficava com o bilhete na
        // mão e sem a chave, e o cliente falava sozinho.
        const cfg = configUazapi();
        const { data: cofre } = await crm("whatsapp_instance_secrets")
          .select("instance_token")
          .eq("tenant_id", loja.tenantId)
          .eq("provider", "uazapi")
          .maybeSingle();

        const uazapi =
          cfg && cofre?.instance_token
            ? { baseUrl: cfg.baseUrl, instanceToken: String(cofre.instance_token) }
            : null;

        return new Response(
          JSON.stringify({
            success: true,
            message_id: linha?.message_id ?? null,
            conversation_id: linha?.conversation_id ?? null,
            duplicada: Boolean(linha?.duplicada),
            external_id: uaz?.externalId ?? (corpo.external_id ? String(corpo.external_id) : null),
            uazapi,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

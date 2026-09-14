import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm } from "@/lib/crm/db";
import { configUazapi } from "@/lib/whatsapp/uazapi";

/**
 * A resposta da atendente automática: registra no painel e devolve a chave.
 *
 * POR QUE ELE EXISTE, EM VEZ DE O FLUXO SÓ ENVIAR DIRETO
 *
 * Se a IA respondesse por fora, o dono abriria a aba Chat e veria só metade da
 * conversa: as perguntas do cliente, sem as respostas. Ele não teria como
 * saber o que foi prometido em nome dele — e é ele quem vai ter que cumprir.
 * É o funcionário que atende o telefone e não anota nada na comanda.
 *
 * Então a ordem é: REGISTRA PRIMEIRO, envia depois. Se o envio falhar, fica a
 * mensagem marcada como não enviada, que é uma informação útil. O contrário
 * (enviar e não registrar) produziria um cliente que recebeu algo que o
 * restaurante não sabe que mandou.
 *
 * A resposta traz a credencial do aparelho daquela loja para o fluxo enviar na
 * hora. Ela vem a cada chamada de propósito: quando o lojista religa o
 * WhatsApp a credencial pode mudar, e guardá-la dentro do fluxo faria cada
 * religamento exigir um humano editando o fluxo.
 *
 * Depois de enviar, o fluxo avisa o resultado no MESMO endereço de sempre:
 * POST /api/crm/outbox/result
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/reply
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "...", "token": "...",
 *                "phone": "5571999999999", "text": "resposta da IA" }
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/reply")({
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

        const telefone = String(corpo.phone ?? corpo.phone_e164 ?? "").replace(/[^0-9]/g, "");
        const texto = String(corpo.text ?? corpo.message ?? "").trim();

        if (!telefone || !texto) {
          return new Response(JSON.stringify({ success: false, error: "dados_incompletos" }), {
            status: 400,
            headers: cabecalhos,
          });
        }
        if (texto.length > 4096) {
          return new Response(JSON.stringify({ success: false, error: "texto_muito_longo" }), {
            status: 400,
            headers: cabecalhos,
          });
        }

        // A conversa TEM de existir: quem responde está respondendo a alguém.
        // Se não existe, é sinal de que a mensagem do cliente não foi
        // registrada antes — e responder assim mesmo esconderia esse defeito.
        const { data: contato } = await crm("crm_contacts")
          .select("id")
          .eq("tenant_id", loja.tenantId)
          .eq("phone_e164", telefone)
          .maybeSingle();

        if (!contato) {
          return new Response(
            JSON.stringify({ success: false, error: "conversa_nao_encontrada" }),
            {
              status: 404,
              headers: cabecalhos,
            },
          );
        }

        const { data: conversa } = await crm("crm_conversations")
          .select("id")
          .eq("tenant_id", loja.tenantId)
          .eq("contact_id", contato.id)
          .maybeSingle();

        if (!conversa) {
          return new Response(
            JSON.stringify({ success: false, error: "conversa_nao_encontrada" }),
            {
              status: 404,
              headers: cabecalhos,
            },
          );
        }

        const agora = new Date().toISOString();

        const { data: criada, error } = await crm("crm_messages")
          .insert({
            tenant_id: loja.tenantId,
            conversation_id: conversa.id,
            direction: "out",
            body: texto,
            // Nasce como "saindo" e não como "na fila": quem vai enviar é o
            // fluxo, agora. Deixá-la na fila faria a busca de minuto em minuto
            // pegá-la também, e o cliente receberia duas vezes.
            status: "sending",
            lease_worker: "ia",
            lease_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          console.error("[crm/reply] falha ao registrar a resposta:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        await crm("crm_conversations")
          .update({
            last_message_at: agora,
            last_message_preview: texto.slice(0, 140),
            unread_count: 0,
            status: "pending",
            updated_at: agora,
          })
          .eq("id", conversa.id)
          .eq("tenant_id", loja.tenantId);

        const cfg = configUazapi();
        const { data: cofre } = await crm("whatsapp_instance_secrets")
          .select("instance_token")
          .eq("tenant_id", loja.tenantId)
          .eq("provider", "uazapi")
          .maybeSingle();

        return new Response(
          JSON.stringify({
            success: true,
            message_id: criada.id,
            // `null` quando a loja ainda não conectou o WhatsApp: o fluxo deve
            // parar em vez de tentar enviar para lugar nenhum.
            uazapi:
              cfg && cofre?.instance_token
                ? { baseUrl: cfg.baseUrl, instanceToken: String(cofre.instance_token) }
                : null,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

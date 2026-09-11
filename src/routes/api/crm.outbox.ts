import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm, crmRpc } from "@/lib/crm/db";
import { configUazapi } from "@/lib/whatsapp/uazapi";

/**
 * A fila de saída: o que o RESTAURANTE respondeu e ainda não foi entregue.
 *
 * O n8n passa de tempos em tempos perguntando "tem algo para eu levar?" — é o
 * entregador passando na loja para pegar os pedidos prontos, em vez de a
 * cozinha correr atrás de cada moto. Assim o envio não depende do painel
 * ficar aberto, e quem clicou em responder não fica esperando de olho na
 * tela.
 *
 * PARA CONFIGURAR NO N8N (um fluxo por restaurante)
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/outbox
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "<id da loja>", "token": "<senha da loja>",
 *                "limit": 50, "worker": "n8n-loja-x", "lease": 300 }
 *
 * A RESPOSTA JÁ TRAZ A CREDENCIAL DO APARELHO daquela loja, em `uazapi`. O
 * fluxo usa isso direto no `POST /send/text` da UAZAPI, sem ninguém precisar
 * colar token nenhum na mão.
 *
 * Isso não é preguiça: é o que faz o religamento pelo QR Code valer. Quando o
 * lojista reconecta o WhatsApp, a credencial pode mudar — se ela estivesse
 * escrita dentro do fluxo, cada religamento exigiria um humano editando o
 * fluxo daquela loja. O lojista religaria sozinho e continuaria mudo.
 *
 * A credencial só sai daqui para quem já apresentou as DUAS chaves (a mestra e
 * a da loja), e vale só para o aparelho daquela loja.
 *
 * A RESERVA é o que impede o mesmo recado de sair duas vezes: cada mensagem
 * entregue ao n8n fica reservada por alguns minutos. Se o fluxo travar no
 * meio, a reserva vence sozinha e a mensagem volta para a fila. Nada fica
 * preso, nada é enviado em dobro.
 *
 * Depois de enviar, o n8n precisa avisar em POST /api/crm/outbox/result —
 * senão a mensagem fica como "saindo" até a reserva vencer e ser tentada de
 * novo.
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/outbox")({
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

        const limite = Math.min(Math.max(Number(corpo.limit ?? 50) || 50, 1), 200);
        const worker = String(corpo.worker ?? "n8n").slice(0, 60);
        const lease = Math.min(Math.max(Number(corpo.lease ?? 300) || 300, 30), 1800);

        const { data, error } = await crmRpc("crm_next_outbox", {
          p_tenant_id: loja.tenantId,
          p_limit: limite,
          p_worker: worker,
          p_lease_seconds: lease,
        });

        if (error) {
          console.error("[crm/outbox] falha ao reservar lote:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        const mensagens = (data ?? []) as Array<Record<string, unknown>>;

        // A credencial do aparelho só é buscada quando há o que enviar: não há
        // motivo para ela circular numa visita em que a fila estava vazia.
        let uazapi: { baseUrl: string; instanceToken: string } | null = null;
        if (mensagens.length > 0) {
          const cfg = configUazapi();
          const { data: cofre } = await crm("whatsapp_instance_secrets")
            .select("instance_token")
            .eq("tenant_id", loja.tenantId)
            .eq("provider", "uazapi")
            .maybeSingle();

          if (cfg && cofre?.instance_token) {
            uazapi = { baseUrl: cfg.baseUrl, instanceToken: String(cofre.instance_token) };
          }
        }

        // A própria visita é o sinal de vida do fluxo. Antes disso existia um
        // endereço só para bater o ponto; agora ele virou opcional, porque
        // quem vem buscar a fila de minuto em minuto já provou que está de pé.
        // Um pedaço a menos para montar em cada loja é um pedaço a menos para
        // alguém esquecer de montar.
        await crm("crm_n8n_links")
          .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("tenant_id", loja.tenantId);

        return new Response(
          JSON.stringify({
            success: true,
            count: mensagens.length,
            // `null` quando a loja ainda não conectou o WhatsApp. O fluxo deve
            // parar e não tentar enviar: sem aparelho, não há para onde ir.
            uazapi,
            messages: mensagens,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

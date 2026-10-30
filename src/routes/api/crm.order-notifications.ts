import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crmRpc } from "@/lib/crm/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { configUazapi } from "@/lib/whatsapp/uazapi";
import {
  montarAvisoAutomatico,
  normalizarTelefone,
  type FlyStatusKind,
  type FlyStatusPizzeria,
} from "@/lib/flystatus/mensagem";

/**
 * A fila de AVISOS DE PEDIDO: "seu pedido está em preparo", "saiu para
 * entrega", "foi entregue".
 *
 * O aviso entra na fila sozinho, pelo banco, no instante em que o pedido muda
 * de etapa — e só para a loja que ligou o envio automático. O n8n passa aqui
 * de minuto em minuto, pega o que está pronto e entrega pelo WhatsApp da loja.
 *
 * PARA CONFIGURAR NO N8N (um fluxo por restaurante)
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/order-notifications
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "<id da loja>", "token": "<senha da loja>",
 *                "limit": 20, "worker": "n8n-pedidos", "lease": 300 }
 *
 * Resposta: { uazapi: {baseUrl, instanceToken} | null, notifications: [
 *   { notification_id, phone, text, image_url, kind, order_number } ] }
 *
 * Com `image_url`, o fluxo usa /send/media (imagem com legenda); sem, /send/text.
 * Depois avisa o resultado em POST /api/crm/order-notifications/result.
 *
 * SEM WHATSAPP CONECTADO, NADA É RESERVADO: os avisos ficam esperando o
 * aparelho voltar (e os muito antigos expiram, para o cliente não receber
 * "em preparo" depois de já ter comido).
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/order-notifications")({
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

        // Primeiro o aparelho: sem ele não há como entregar, e reservar o
        // aviso só o faria esperar à toa até a reserva vencer.
        const cfg = configUazapi();
        const { data: cofre } = await supabaseAdmin
          .from("whatsapp_instance_secrets" as never)
          .select("instance_token")
          .eq("tenant_id", loja.tenantId)
          .eq("provider", "uazapi")
          .maybeSingle();
        const token = (cofre as { instance_token?: string } | null)?.instance_token;

        if (!cfg || !token) {
          return new Response(
            JSON.stringify({ success: true, count: 0, uazapi: null, notifications: [] }),
            { status: 200, headers: cabecalhos },
          );
        }

        const limite = Math.min(Math.max(Number(corpo.limit ?? 20) || 20, 1), 100);
        const worker = String(corpo.worker ?? "n8n-pedidos").slice(0, 60);
        const lease = Math.min(Math.max(Number(corpo.lease ?? 300) || 300, 30), 1800);

        const { data, error } = await crmRpc("proximos_avisos_de_pedido", {
          p_tenant_id: loja.tenantId,
          p_limit: limite,
          p_worker: worker,
          p_lease_seconds: lease,
        });

        if (error) {
          console.error("[crm/order-notifications] falha ao reservar lote:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        const linhas = (data ?? []) as Array<{
          notification_id: string;
          kind: FlyStatusKind;
          order_number: string | null;
          customer_name: string | null;
          customer_phone: string | null;
        }>;

        if (linhas.length === 0) {
          return new Response(
            JSON.stringify({ success: true, count: 0, uazapi: null, notifications: [] }),
            { status: 200, headers: cabecalhos },
          );
        }

        // Texto e arte vêm do cadastro da loja, nunca de quem chama.
        const { data: lojaRaw } = await supabaseAdmin
          .from("pizzerias")
          .select(
            "status_art_preparando_url, status_art_saiu_url, status_art_entregue_url, " +
              "status_text_preparando, status_text_saiu, status_text_entregue",
          )
          .eq("id", loja.tenantId)
          .maybeSingle();

        const notifications = linhas.map((l) => {
          const aviso = montarAvisoAutomatico(
            lojaRaw as unknown as FlyStatusPizzeria | null,
            l.kind,
            l.order_number ?? "",
            l.customer_name ?? "",
          );
          return {
            notification_id: l.notification_id,
            kind: l.kind,
            order_number: l.order_number,
            phone: normalizarTelefone(l.customer_phone),
            text: aviso.texto,
            image_url: aviso.imagemUrl,
          };
        });

        return new Response(
          JSON.stringify({
            success: true,
            count: notifications.length,
            uazapi: { baseUrl: cfg.baseUrl, instanceToken: String(token) },
            notifications,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

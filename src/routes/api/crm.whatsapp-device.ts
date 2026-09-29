import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm } from "@/lib/crm/db";
import { configUazapi } from "@/lib/whatsapp/uazapi";
import { escolherAparelho } from "@/lib/flystatus/aparelho";

/**
 * "Qual é o WhatsApp desta loja?" — só isso, para um fluxo do n8n que precisa
 * mandar uma mensagem avulsa (hoje: a atualização de status do FlyStatus) sem
 * passar pela fila de conversa do Chat.
 *
 * POR QUE É UM ENDEREÇO PRÓPRIO, EM VEZ DE REAPROVEITAR /api/crm/outbox OU
 * /api/crm/reply
 *
 * Os dois já devolvem a credencial do aparelho, mas cada um faz isso como
 * efeito colateral de outra coisa: `outbox` RESERVA um lote de mensagens de
 * verdade da fila de conversa, e `reply` EXIGE que já exista uma conversa
 * daquele cliente no Chat. Usar qualquer um dos dois só para pegar o token
 * ou reservaria mensagens que não existem, ou quebraria para todo pedido
 * cujo cliente nunca mandou mensagem no WhatsApp — o caso comum de quem
 * comprou só pelo cardápio do site.
 *
 * A mesma dupla tranca dos outros endereços do n8n (chave mestra do CRM + a
 * senha desta loja) — ver `n8nAuth.ts`.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/whatsapp-device
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "...", "token": "..." }
 *   Resposta:  { "success": true, "uazapi": { "baseUrl", "instanceToken", "instance" } | null }
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/whatsapp-device")({
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

        const [cofre, marketing] = await Promise.all([
          crm("whatsapp_instance_secrets" as never)
            .select("instance_token")
            .eq("tenant_id", loja.tenantId)
            .eq("provider", "uazapi")
            .maybeSingle(),
          crm("marketing_whatsapp_instances" as never)
            .select("external_instance_id")
            .eq("tenant_id", loja.tenantId)
            .maybeSingle(),
        ]);

        const cfg = configUazapi();
        const aparelho = escolherAparelho({
          baseUrl: cfg?.baseUrl,
          tokenDaLoja: (cofre.data as { instance_token?: string } | null)?.instance_token,
          tokenGeral: process.env.UAZAPI_TOKEN,
          instanciaGeral: (marketing.data as { external_instance_id?: string } | null)
            ?.external_instance_id,
        });

        return new Response(
          JSON.stringify({
            success: true,
            // `null` quando a loja ainda não conectou o WhatsApp. O fluxo deve
            // parar e não tentar enviar para lugar nenhum.
            uazapi: aparelho
              ? { baseUrl: aparelho.baseUrl, instanceToken: aparelho.token, instance: aparelho.instancia }
              : null,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

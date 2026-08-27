import { createFileRoute } from "@tanstack/react-router";
import { autenticarN8n, respostaNegada } from "@/lib/marketing/n8nAuth";
import { mktRpc } from "@/lib/marketing/db";

/**
 * A fila que o n8n vem buscar.
 *
 * COMO FUNCIONA, NA PRÁTICA
 *
 * O FlyControl não sai enviando mensagem. Ele deixa as mensagens prontas
 * numa fila e o n8n passa de tempos em tempos perguntando "tem alguma coisa
 * para eu levar?". É o entregador passando na loja para pegar os pedidos
 * prontos, em vez de a cozinha correr atrás de cada moto.
 *
 * Isso resolve três coisas de uma vez:
 *
 * - o disparo não depende de o painel ficar aberto;
 * - quem clicou em "enviar" não fica esperando mil mensagens saírem;
 * - se a internet do fornecedor cair, as mensagens continuam na fila em vez
 *   de se perderem.
 *
 * O QUE ACONTECE A CADA VISITA
 *
 * GET: devolve até `limit` mensagens, JÁ RESERVADAS em nome de quem pediu.
 * A reserva vale por alguns minutos: se o n8n travar no meio, ela vence e as
 * mensagens voltam para a fila sozinhas — nenhuma mensagem fica presa e
 * nenhuma é enviada duas vezes.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:   GET
 *   URL:      https://<seu-dominio>/api/marketing/queue?limit=50&worker=n8n-1
 *   Cabeçalho: Authorization: Bearer <MARKETING_N8N_SECRET>
 *
 * A resposta traz, para cada mensagem: recipient_id, phone_e164 (já no
 * formato pronto: 55 + DDD + número), message (já com o nome do cliente no
 * lugar), media_url quando houver imagem, e external_instance_id — qual
 * aparelho de WhatsApp usar, porque cada restaurante tem o seu.
 *
 * Depois de enviar, o n8n precisa avisar o resultado em
 * POST /api/marketing/queue/result — senão a mensagem fica como "processando"
 * até a reserva vencer e ser tentada de novo.
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/marketing/queue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = autenticarN8n(request);
        if (!auth.ok) return respostaNegada(auth);

        const url = new URL(request.url);
        const limite = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1),
          200,
        );
        const worker = (url.searchParams.get("worker") || "n8n").slice(0, 60);
        const leaseSegundos = Math.min(
          Math.max(Number(url.searchParams.get("lease") ?? 300) || 300, 30),
          1800,
        );
        // Filtrar por loja é opcional e serve para o dia em que houver um
        // fluxo do n8n por restaurante. Sem ele, vem de todas as lojas.
        const tenantId = url.searchParams.get("tenant_id");

        const { data, error } = await mktRpc("marketing_next_batch", {
          p_limit: limite,
          p_worker: worker,
          p_lease_seconds: leaseSegundos,
          p_tenant_id: tenantId || null,
        });

        if (error) {
          console.error("[marketing/queue] falha ao reservar lote:", error.message);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }

        const mensagens = (data ?? []) as Array<Record<string, unknown>>;

        // Mensagem de restaurante sem WhatsApp ligado não tem para onde ir.
        // Em vez de o n8n tentar e falhar em cada uma, avisamos aqui.
        const semInstancia = mensagens.filter((m) => !m.external_instance_id).length;

        return new Response(
          JSON.stringify({
            success: true,
            count: mensagens.length,
            sem_instancia: semInstancia,
            messages: mensagens,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

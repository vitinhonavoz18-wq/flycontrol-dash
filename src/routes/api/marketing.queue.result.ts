import { createFileRoute } from "@tanstack/react-router";
import { autenticarN8n, respostaNegada } from "@/lib/marketing/n8nAuth";
import { mktRpc, mkt } from "@/lib/marketing/db";
import { traduzirStatus } from "@/lib/marketing/whatsappGateway";

/**
 * O n8n avisando o que aconteceu com cada mensagem.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/marketing/queue/result
 *   Cabeçalho: Authorization: Bearer <MARKETING_N8N_SECRET>
 *   Corpo:     { "results": [ { "recipient_id": "...", "status": "sent",
 *                               "provider_message_id": "ABC123" } ] }
 *
 * Aceita uma mensagem ou um lote. Um lote é bem melhor: enviar 500 avisos
 * separados é 500 idas e voltas pela internet.
 *
 * DUAS GARANTIAS QUE VALEM A PENA CONHECER
 *
 * 1. Avisar duas vezes não conta duas vezes. Se o n8n mandar o mesmo aviso de
 *    novo — porque não teve certeza de que o primeiro chegou —, o relatório
 *    da campanha continua certo. É o entregador tocando a campainha de novo
 *    achando que ninguém ouviu: a segunda campainhada não gera um segundo
 *    pedido.
 *
 * 2. Aviso atrasado não anda para trás. Se o "entregue" chegar antes do
 *    "enviado" (acontece), o "enviado" atrasado não desfaz a entrega.
 *
 * SOBRE OS NOMES DE STATUS
 *
 * Pode mandar o nome que o fornecedor usa ("server_ack", "delivery_ack",
 * "read"…). A tradução para o vocabulário do FlyControl acontece aqui. Se
 * chegar um nome desconhecido, ele vira "ainda processando" em vez de virar
 * "falhou" — chutar falha faria a mensagem ser reenviada e o cliente receber
 * duas vezes.
 */

const cabecalhos = { "Content-Type": "application/json" };
const LOTE_MAXIMO = 500;

type Resultado = {
  recipient_id?: string;
  recipientId?: string;
  status?: string;
  provider_message_id?: string;
  error_code?: string;
  error_message?: string;
};

export const Route = createFileRoute("/api/marketing/queue/result")({
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

        // Aceita os três formatos que um fluxo do n8n costuma produzir:
        // { results: [...] }, uma lista solta, ou um resultado só.
        const envelope = corpo as { results?: unknown } | null;
        const lista: Resultado[] = Array.isArray(envelope?.results)
          ? (envelope.results as Resultado[])
          : Array.isArray(corpo)
            ? (corpo as Resultado[])
            : corpo && typeof corpo === "object"
              ? [corpo as Resultado]
              : [];

        if (lista.length === 0) {
          return new Response(JSON.stringify({ success: false, error: "nada_para_registrar" }), {
            status: 400,
            headers: cabecalhos,
          });
        }
        if (lista.length > LOTE_MAXIMO) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "lote_grande_demais",
              message: `Mande no máximo ${LOTE_MAXIMO} resultados por vez.`,
            }),
            { status: 400, headers: cabecalhos },
          );
        }

        let aplicados = 0;
        let ignorados = 0;
        const problemas: string[] = [];

        for (const r of lista) {
          const id = (r.recipient_id ?? r.recipientId ?? "").trim();
          if (!id) {
            ignorados++;
            continue;
          }

          const { data, error } = await mktRpc("marketing_record_result", {
            p_recipient_id: id,
            p_status: traduzirStatus(r.status),
            p_provider_message_id: r.provider_message_id ?? null,
            p_error_code: r.error_code ?? null,
            p_error_message: r.error_message ?? null,
          });

          if (error) {
            // Uma linha com problema não pode derrubar o lote inteiro: as
            // outras 499 mensagens precisam ser registradas.
            problemas.push(`${id}: ${error.message}`);
            continue;
          }

          const linha = Array.isArray(data) ? data[0] : data;
          if (linha?.aplicado) aplicados++;
          else ignorados++;
        }

        if (problemas.length) {
          console.error("[marketing/result] linhas com problema:", problemas.slice(0, 5));
        }

        return new Response(
          JSON.stringify({
            success: true,
            aplicados,
            // "Ignorados" quase sempre significa aviso repetido — é esperado
            // e não é erro.
            ignorados,
            com_erro: problemas.length,
          }),
          { status: 200, headers: cabecalhos },
        );
      },
    },
  },
});

/**
 * Status da conexão do WhatsApp de um restaurante, informado pelo n8n.
 *
 * Exportado aqui por proximidade: é o mesmo canal de comunicação e o mesmo
 * segredo. Fica na rota /api/marketing/instance-status.
 */
export async function registrarStatusInstancia(
  tenantId: string,
  status: string,
  extra: { external_instance_id?: string; phone_e164?: string; mensagem?: string },
) {
  const mapa: Record<string, string> = {
    connected: "connected",
    open: "connected",
    connecting: "connecting",
    disconnected: "disconnected",
    close: "disconnected",
    error: "error",
  };
  const interno = mapa[String(status).toLowerCase()] ?? "disconnected";

  await mkt("marketing_whatsapp_instances").upsert(
    {
      tenant_id: tenantId,
      provider: "uazapi",
      external_instance_id: extra.external_instance_id ?? null,
      phone_e164: extra.phone_e164 ?? null,
      status: interno,
      status_message: extra.mensagem ?? null,
      connected_at: interno === "connected" ? new Date().toISOString() : null,
      disconnected_at: interno === "disconnected" ? new Date().toISOString() : null,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider" },
  );
}

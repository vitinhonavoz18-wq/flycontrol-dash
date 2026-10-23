import { crm, crmRpc } from "./db";
import { enderecosAssinados } from "./midiaServidor";
import { configUazapi, enviarMidia, enviarTexto, type RespostaUazapi } from "@/lib/whatsapp/uazapi";

/* As tabelas do CRM ainda não constam do arquivo de tipos gerado (ver
   `db.ts`), então as linhas chegam sem tipo. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ENVIO NA HORA do que a equipe respondeu pelo painel.
 *
 * Antes, a resposta entrava na fila e esperava o n8n passar — e ele passa de
 * minuto em minuto. Na prática o atendente digitava "já sai!" e o cliente
 * recebia quase um minuto depois. É o pedido pronto no balcão esperando o
 * motoboy da rodada seguinte, quando o motoboy podia ser a própria cozinha.
 *
 * Agora o próprio FlyControl entrega na hora em que a pessoa aperta enviar.
 *
 * A FILA CONTINUA SENDO A REDE DE SEGURANÇA. Se o WhatsApp não responder, a
 * mensagem volta para a fila e o n8n leva na passada seguinte, como sempre.
 * Nada se perde por causa do atalho.
 *
 * NADA SAI EM DOBRO. Antes de enviar, a mensagem é RESERVADA (status
 * "sending" com prazo). O n8n só pega o que está livre, então os dois nunca
 * pegam a mesma mensagem — é a comanda presa no espeto: quem pegou, leva.
 */

/** Quem reservou: aparece em `lease_worker` para distinguir do n8n. */
const RESERVA = "painel";
/** Tempo da reserva. Se o servidor cair no meio, o n8n assume depois disso. */
const RESERVA_SEGUNDOS = 60;
/** Mensagens de uma vez: o atendente não manda mais que isso num clique. */
const LIMITE = 10;

export type DestinoDoEnvio = "sent" | "failed" | "fila";

/**
 * O que fazer com a mensagem depois de tentar.
 *
 * - deu certo → enviada;
 * - o WhatsApp recusou o pedido (número inválido, aparelho desligado) →
 *   falha, porque tentar de novo daria o mesmo erro;
 * - o WhatsApp não respondeu ou caiu → volta para a fila e o n8n tenta.
 */
export function destinoDoEnvio(r: RespostaUazapi<unknown>): DestinoDoEnvio {
  if (r.ok) return "sent";
  return r.podeTentarDeNovo ? "fila" : "failed";
}

/** O mesmo critério do fluxo do n8n: o que não é áudio, vídeo ou documento vai como imagem. */
export function tipoParaUazapi(
  tipo: string | null | undefined,
): "image" | "audio" | "video" | "document" {
  return tipo === "audio" || tipo === "video" || tipo === "document" ? tipo : "image";
}

async function devolverParaFila(tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  await crm("crm_messages")
    .update({
      status: "queued",
      lease_until: null,
      lease_worker: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .eq("status", "sending")
    .eq("lease_worker", RESERVA);
}

/**
 * Entrega agora o que estiver na fila desta conversa.
 *
 * Nunca lança erro: a mensagem já está salva na fila antes de chegar aqui. Se
 * algo der errado no caminho, o pior caso é o de antes — sair na próxima
 * passada do n8n.
 *
 * Só chame depois de o porteiro ter conferido a loja: este arquivo usa a
 * chave de serviço e confia no `tenantId` recebido.
 */
export async function entregarAgora(tenantId: string, conversationId: string): Promise<void> {
  let reservadas: string[] = [];
  try {
    const cfg = configUazapi();
    if (!cfg) return;

    // Fluxo pausado (cancelamento, manutenção) não envia nada — nem pela
    // fila, nem pelo atalho. Mesma regra da porta do n8n.
    const { data: ligacao } = await crm("crm_n8n_links")
      .select("status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ligacao?.status === "paused") return;

    const { data: cofre } = await crm("whatsapp_instance_secrets")
      .select("instance_token")
      .eq("tenant_id", tenantId)
      .eq("provider", "uazapi")
      .maybeSingle();
    const token = cofre?.instance_token ? String(cofre.instance_token) : "";
    if (!token) return;

    const { data: conversa } = await crm("crm_conversations")
      .select("customer_id")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!conversa?.customer_id) return;

    const { data: cliente } = await crm("marketing_customers")
      .select("phone_e164")
      .eq("id", conversa.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const numero = String(cliente?.phone_e164 ?? "").replace(/\D/g, "");
    if (!numero) return;

    // A RESERVA. Só pega o que está livre na fila; o que o n8n já reservou
    // fica com ele.
    const agora = Date.now();
    const { data: linhas, error } = await crm("crm_messages")
      .update({
        status: "sending",
        lease_until: new Date(agora + RESERVA_SEGUNDOS * 1000).toISOString(),
        lease_worker: RESERVA,
        updated_at: new Date(agora).toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("direction", "out")
      .eq("status", "queued")
      .is("lease_until", null)
      .select("id, body, media_path, media_type, created_at");

    if (error || !linhas || linhas.length === 0) return;

    // Em ordem de chegada: o cliente lê na ordem em que a equipe escreveu.
    const fila = (linhas as any[])
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, LIMITE);
    reservadas = (linhas as any[]).map((l) => String(l.id));
    // O que passou do limite volta já, sem esperar a reserva vencer.
    const sobra = reservadas.filter((id) => !fila.some((m) => String(m.id) === id));
    await devolverParaFila(tenantId, sobra);
    reservadas = fila.map((m) => String(m.id));

    const assinados = await enderecosAssinados(
      fila.map((m) => String(m.media_path ?? "")).filter(Boolean),
    );

    for (const m of fila) {
      const id = String(m.id);
      const texto = String(m.body ?? "");
      const caminho = String(m.media_path ?? "");
      const endereco = caminho ? assinados.get(caminho) : undefined;

      let r: RespostaUazapi<{ messageId: string | null }>;
      if (caminho && !endereco) {
        // Sem endereço do arquivo não dá para mandar agora. O n8n tenta depois.
        r = { ok: false, erro: "arquivo indisponível", podeTentarDeNovo: true };
      } else if (endereco) {
        r = await enviarMidia(token, numero, tipoParaUazapi(m.media_type), endereco, texto);
      } else {
        r = await enviarTexto(token, numero, texto);
      }

      const destino = destinoDoEnvio(r);
      if (destino === "fila") {
        // Parou aqui: esta e as seguintes voltam para a fila JUNTAS, para o
        // cliente não receber a terceira frase antes da segunda.
        await devolverParaFila(tenantId, reservadas);
        reservadas = [];
        return;
      }

      await crmRpc("crm_record_outbox_result", {
        p_message_id: id,
        p_tenant_id: tenantId,
        p_status: destino,
        p_external_id: r.ok ? r.dados.messageId : null,
        p_error: r.ok ? null : `WhatsApp: ${r.erro}`.slice(0, 500),
      });
      reservadas = reservadas.filter((x) => x !== id);
    }
  } catch (e) {
    console.error("[crm/envio-imediato] falhou, a mensagem fica para o n8n:", e);
    try {
      await devolverParaFila(tenantId, reservadas);
    } catch {
      // A reserva vence sozinha em um minuto e o n8n assume.
    }
  }
}

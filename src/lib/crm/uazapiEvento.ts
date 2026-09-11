/**
 * O tradutor do evento da UAZAPI para o vocabulário do FlyControl.
 *
 * POR QUE ELE EXISTE
 *
 * O fluxo do n8n pode repassar o evento da UAZAPI CRU, sem montar nada. Isso é
 * de propósito: quanto menos o fluxo precisar remontar, menos lugar existe
 * para ele errar — e, como há um fluxo por loja, um erro desses teria de ser
 * corrigido loja por loja, uma por uma.
 *
 * DUAS COISAS SÃO JOGADAS FORA DE PROPÓSITO:
 *
 *   - o que o PRÓPRIO RESTAURANTE enviou (`fromMe`). Sem esse filtro, a
 *     resposta que o atendente acabou de mandar voltaria para a tela como se
 *     o cliente tivesse falado, e a conversa viraria um eco;
 *   - mensagem de GRUPO, porque CRM de atendimento não é grupo da família.
 *
 * O mesmo filtro também é pedido à UAZAPI na hora de configurar o aviso
 * (`excludeMessages`). Estar nos dois lugares é intencional: se alguém
 * reconfigurar o aparelho por fora e esquecer o filtro de lá, este aqui
 * continua segurando. Duas redes debaixo do trapezista.
 */

export type EventoTraduzido = {
  /** Recebido e descartado de propósito (eco do próprio restaurante, grupo). */
  ignorar?: boolean;
  telefone?: string;
  texto?: string | null;
  nome?: string | null;
  externalId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

/**
 * Devolve `null` quando NÃO é um evento da UAZAPI — aí valem os campos
 * simples (`phone`, `message`), para um fluxo que prefira montar tudo na mão.
 */
export function extrairDaUazapi(corpo: Record<string, unknown>): EventoTraduzido | null {
  const dados = corpo.data ?? corpo.message ?? null;
  if (!dados || typeof dados !== "object") return null;

  const m = (Array.isArray(dados) ? dados[0] : dados) as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") return null;

  // Sem nenhum destes campos, não é o formato da UAZAPI.
  if (!("chatid" in m) && !("messageid" in m) && !("sender" in m)) return null;

  if (m.fromMe === true || m.isGroup === true) return { ignorar: true };

  const de = String(m.sender ?? m.chatid ?? "");
  // Grupo e canal de transmissão nunca viram conversa de atendimento.
  if (de.includes("@g.us") || de.includes("@newsletter") || de.includes("@broadcast")) {
    return { ignorar: true };
  }

  const telefone = de.split("@")[0]?.replace(/[^0-9]/g, "") ?? "";
  const tipo = String(m.messageType ?? "").toLowerCase();

  return {
    telefone,
    texto: typeof m.text === "string" && m.text !== "" ? m.text : null,
    nome: typeof m.senderName === "string" && m.senderName.trim() ? m.senderName.trim() : null,
    externalId: typeof m.messageid === "string" && m.messageid ? m.messageid : null,
    mediaUrl: typeof m.fileURL === "string" && m.fileURL ? m.fileURL : null,
    mediaType: tipo || null,
  };
}

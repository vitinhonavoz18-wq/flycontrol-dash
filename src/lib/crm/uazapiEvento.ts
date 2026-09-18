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
 * ONDE ESTÁ O NOME DO CLIENTE (e onde NÃO está)
 *
 * Este foi um erro caro. O evento traz vários campos com cara de nome, e
 * quase todos são armadilha:
 *
 *   chat.lead_fullName / chat.lead_name .. o nome que alguém cadastrou. Vale.
 *   chat.name / chat.wa_name ............. como o cliente aparece na agenda
 *                                          do aparelho. Vale.
 *   chat.wa_contactName .................. costuma vir VAZIO.
 *   message.senderName ................... quem ASSINOU a mensagem. Só vale
 *                                          quando quem falou foi o cliente.
 *
 * Numa mensagem que o próprio dono digitou no celular dele, `senderName` é o
 * nome do perfil DA LOJA. O fluxo lia "wa_contactName, e se estiver vazio usa
 * senderName" — e foi exatamente assim que três clientes diferentes foram
 * gravados com o nome da loja. Como o nome só era gravado na primeira
 * mensagem e nunca mais, ficou errado para sempre.
 *
 * O QUE O PRÓPRIO RESTAURANTE ENVIOU NÃO É DESCARTADO — É VIRADO DO LADO CERTO
 *
 * Antes, `fromMe` era jogado fora. O efeito colateral: a resposta que o dono
 * digitou no celular dele sumia do painel, e quem olhasse a conversa via o
 * cliente perguntando e ninguém respondendo. Agora ela entra como mensagem da
 * loja, do lado da loja. Jogar fora era a comanda sem a parte do garçom.
 *
 * Mensagem de GRUPO continua fora: CRM de atendimento não é grupo da família.
 */

export type EventoTraduzido = {
  /** Recebido e descartado de propósito (grupo, transmissão). */
  ignorar?: boolean;
  /** Digitada pelo próprio restaurante — entra como mensagem da loja. */
  fromMe?: boolean;
  telefone?: string;
  texto?: string | null;
  nome?: string | null;
  externalId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

function textoUtil(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * O nome do cliente, na ordem de quem merece mais confiança.
 *
 * `senderName` entra por último E só quando quem falou foi o cliente.
 */
export function nomeDoCliente(
  chat: Record<string, unknown> | null,
  mensagem: Record<string, unknown>,
  fromMe: boolean,
): string | null {
  const c = chat ?? {};
  return (
    textoUtil(c.lead_fullName) ??
    textoUtil(c.lead_name) ??
    textoUtil(c.name) ??
    textoUtil(c.wa_name) ??
    textoUtil(c.wa_contactName) ??
    (fromMe ? null : textoUtil(mensagem.senderName))
  );
}

/** Só os dígitos de um endereço tipo `557199999999@s.whatsapp.net`. */
function soDigitos(valor: unknown): string {
  return String(valor ?? "")
    .split("@")[0]
    .replace(/[^0-9]/g, "");
}

/**
 * Devolve `null` quando NÃO é um evento da UAZAPI — aí valem os campos
 * simples (`phone`, `message`), para um fluxo que prefira montar tudo na mão.
 */
export function extrairDaUazapi(corpo: Record<string, unknown>): EventoTraduzido | null {
  const bruto = corpo.data ?? corpo.message ?? null;
  if (!bruto || typeof bruto !== "object") return null;

  const m = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") return null;

  // Sem nenhum destes campos, não é o formato da UAZAPI.
  if (!("chatid" in m) && !("messageid" in m) && !("sender" in m)) return null;

  const chat =
    corpo.chat && typeof corpo.chat === "object" && !Array.isArray(corpo.chat)
      ? (corpo.chat as Record<string, unknown>)
      : null;

  if (m.isGroup === true) return { ignorar: true };

  const fromMe = m.fromMe === true;

  // O TELEFONE É SEMPRE O DO CLIENTE, mesmo quando quem falou foi a loja.
  // Numa mensagem do dono, `sender` é o dono — usar esse número abriria uma
  // conversa da loja com ela mesma. Quem identifica o cliente é o `chatid`.
  const endereco = String(m.chatid ?? (fromMe ? "" : (m.sender ?? "")) ?? "");
  if (
    endereco.includes("@g.us") ||
    endereco.includes("@newsletter") ||
    endereco.includes("@broadcast")
  ) {
    return { ignorar: true };
  }

  const telefone = soDigitos(endereco) || soDigitos(chat?.wa_chatid);
  const tipo = String(m.messageType ?? "").toLowerCase();

  return {
    fromMe,
    telefone,
    texto: textoUtil(m.text) ?? textoUtil(m.content),
    nome: nomeDoCliente(chat, m, fromMe),
    externalId: textoUtil(m.messageid),
    mediaUrl: textoUtil(m.fileURL),
    mediaType: tipo || null,
  };
}

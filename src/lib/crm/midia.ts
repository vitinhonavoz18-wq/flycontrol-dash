/**
 * ÁUDIO, FOTO E ARQUIVO no Chat.
 *
 * O ESTRAGO QUE ISTO CONSERTA
 *
 * Quando o cliente mandava um áudio, a mensagem chegava VAZIA no painel: um
 * balão em branco, sem som, sem texto, sem nem dizer que era um áudio. O
 * lojista via um espaço vazio e não tinha como saber que alguém tinha falado
 * com ele. É o recado que o atendente anotou num papel e esqueceu na gaveta.
 *
 * DUAS COISAS DIFERENTES, E AS DUAS IMPORTAM
 *
 *   o ARQUIVO  — o áudio para ouvir, a foto para ver;
 *   o TEXTO    — o que a IA entendeu daquele áudio ou daquela foto.
 *
 * O texto é o que dura. O endereço do arquivo que o WhatsApp entrega VENCE
 * depois de um tempo — é o cupom do estacionamento: vale hoje, amanhã não abre
 * mais a cancela. Por isso a transcrição é guardada junto, e é ela que aparece
 * quando o arquivo já não abre.
 */

export type TipoMidia = "image" | "audio" | "video" | "document";

const TIPOS: TipoMidia[] = ["image", "audio", "video", "document"];

/** O nome que o lojista lê na tela quando o arquivo não pode ser mostrado. */
export const ROTULO_MIDIA: Record<TipoMidia, string> = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  document: "Arquivo",
};

export function ehTipoMidia(v: unknown): v is TipoMidia {
  return typeof v === "string" && TIPOS.includes(v as TipoMidia);
}

/**
 * Descobre o tipo a partir do que o WhatsApp chamou a mensagem.
 *
 * A UAZAPI escreve de várias formas para a mesma coisa — `audioMessage`,
 * `ptt` (que é o áudio gravado na hora), `AudioMessage` com maiúscula. Aceitar
 * as variações aqui é o que evita um balão vazio na tela por causa de uma
 * letra diferente.
 */
export function tipoPeloWhatsApp(messageType: unknown): TipoMidia | null {
  const t = String(messageType ?? "")
    .toLowerCase()
    .trim();
  if (!t) return null;

  if (t.includes("image") || t.includes("sticker")) return "image";
  // "ptt" é como o WhatsApp chama o áudio gravado apertando o microfone.
  if (t.includes("audio") || t === "ptt" || t.includes("voice")) return "audio";
  if (t.includes("video")) return "video";
  if (t.includes("document")) return "document";
  return null;
}

/** Descobre o tipo a partir do tipo do arquivo (image/jpeg, audio/ogg...). */
export function tipoPeloMime(mime: unknown): TipoMidia | null {
  const m = String(mime ?? "")
    .toLowerCase()
    .trim();
  if (!m) return null;
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("application/") || m.startsWith("text/")) return "document";
  return null;
}

/**
 * O que a mensagem mostra na lista de conversas.
 *
 * Preferir a transcrição ao rótulo é o que faz a lista dizer "quero 2 pizzas"
 * em vez de "Áudio" — a diferença entre saber e ter de abrir para descobrir.
 */
export function resumoDaMensagem(corpo: string | null | undefined, tipo: unknown): string {
  const texto = String(corpo ?? "").trim();
  const t = ehTipoMidia(tipo) ? tipo : tipoPeloWhatsApp(tipo);
  if (!t) return texto;
  return texto ? `${ROTULO_MIDIA[t]}: ${texto}` : ROTULO_MIDIA[t];
}

/** O que a loja pode mandar pelo painel, e o teto de tamanho de cada um. */
export const LIMITE_MB: Record<TipoMidia, number> = {
  image: 10,
  audio: 16,
  video: 16,
  document: 20,
};

export type ArquivoRecusado = { ok: false; motivo: string };
export type ArquivoAceito = { ok: true; tipo: TipoMidia };

/**
 * A porta do arquivo que sai do painel.
 *
 * O limite não é capricho: o WhatsApp recusa arquivo grande, e a recusa dele
 * chega depois — com o lojista já achando que mandou. Barrar aqui é dizer não
 * na hora, enquanto ele ainda está olhando a tela.
 */
export function conferirArquivo(mime: unknown, bytes: number): ArquivoAceito | ArquivoRecusado {
  const tipo = tipoPeloMime(mime);
  if (!tipo) {
    return { ok: false, motivo: "Tipo de arquivo não aceito. Use foto, áudio, vídeo ou PDF." };
  }
  const limite = LIMITE_MB[tipo] * 1024 * 1024;
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, motivo: "Arquivo vazio." };
  }
  if (bytes > limite) {
    return {
      ok: false,
      motivo: `${ROTULO_MIDIA[tipo]} maior que ${LIMITE_MB[tipo]}MB. O WhatsApp não aceita.`,
    };
  }
  return { ok: true, tipo };
}

/**
 * O caminho do arquivo dentro do armazenamento.
 *
 * SEMPRE começa pelo número da loja. É isso que permite a regra de acesso
 * dizer "cada um mexe só na sua pasta" — sem a loja no começo do caminho, a
 * regra não teria em que se apoiar e a pasta viraria de todo mundo.
 */
export function caminhoDaMidia(tenantId: string, conversationId: string, nome: string): string {
  const limpo = (nome || "arquivo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    // Dois pontos seguidos viram um. A barra de `../` já caiu na linha de
    // cima, mas deixar o `..` no nome é guardar a marca de uma tentativa de
    // subir de pasta — some com ela e não sobra nem o rastro.
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(-60);
  const carimbo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${tenantId}/${conversationId}/${carimbo}-${limpo}`;
}

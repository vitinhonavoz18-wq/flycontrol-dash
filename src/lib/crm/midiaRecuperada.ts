/**
 * BUSCAR NO WHATSAPP O ARQUIVO QUE NUNCA FOI GUARDADO — as regras puras.
 *
 * O ESTRAGO QUE ISTO CONSERTA
 *
 * Milhares de áudios, fotos, vídeos e PDFs estavam registrados no Chat SEM o
 * arquivo. O fluxo do n8n só baixava o áudio quando a IA ia responder; quando
 * um atendente estava no comando (ou quando era vídeo, PDF, ou o próprio dono
 * mandando pelo celular), ninguém buscava nada. O painel mostrava a palavra
 * "Áudio" e mais nada — o recado anotado e esquecido na gaveta.
 *
 * Agora o próprio FlyControl busca o arquivo na UAZAPI, pelo número da
 * mensagem, na primeira vez que alguém olha — e guarda na pasta fechada da
 * loja. Da segunda vez em diante, vem da pasta.
 *
 * Este arquivo não fala com rede nenhuma: só decide. Assim dá para testar
 * cada decisão sem WhatsApp, sem banco e sem internet.
 */

import type { TipoMidia } from "./midia";

/**
 * O teto do que guardamos: 20 MB, o mesmo limite da pasta no Supabase.
 *
 * Um vídeo de 80 MB não cabe na pasta. Melhor dizer "grande demais, veja no
 * celular" do que travar o painel baixando algo que não vai poder ser
 * guardado.
 */
export const LIMITE_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Os tipos que a pasta aceita, já com os documentos do dia a dia.
 *
 * Os de Word/Excel/texto só funcionam depois de aplicar a migração
 * `20261022150000_chat_crm_2_tipos_de_documento.sql`. Sem ela, o arquivo é
 * recusado pela pasta e a tela diz isso com clareza — nada quebra.
 */
const MIMES_DE_DOCUMENTO = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
};

export function extensaoDoMime(mime: string): string {
  return EXTENSAO[mime] ?? "bin";
}

function comeca(bytes: Uint8Array, assinatura: number[], desde = 0): boolean {
  if (bytes.length < desde + assinatura.length) return false;
  return assinatura.every((b, i) => bytes[desde + i] === b);
}

function texto(bytes: Uint8Array, de: number, ate: number): string {
  return String.fromCharCode(...bytes.slice(de, ate));
}

/**
 * Descobre o tipo VERDADEIRO do arquivo pelos primeiros bytes.
 *
 * O nome e o rótulo que vêm de fora podem mentir — por engano ou de
 * propósito. Os primeiros bytes não: todo JPEG começa igual, todo PDF começa
 * com "%PDF". É conferir o lacre da embalagem em vez de acreditar na
 * etiqueta. Isso impede, por exemplo, que uma página da internet disfarçada
 * de foto seja guardada e depois aberta como se fosse foto.
 */
export function farejarMime(bytes: Uint8Array): string | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (comeca(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (texto(bytes, 0, 4) === "RIFF" && texto(bytes, 8, 12) === "WEBP") return "image/webp";
  if (texto(bytes, 0, 4) === "RIFF" && texto(bytes, 8, 12) === "WAVE") return "audio/wav";
  if (texto(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (texto(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (texto(bytes, 0, 3) === "ID3") return "audio/mpeg";
  // Quadro de MP3 sem etiqueta: 11 bits ligados no começo.
  if (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // 0xFFF1/0xFFF9 é AAC cru (ADTS), não MP3.
    if ((bytes[1] & 0x06) === 0) return "audio/aac";
    return "audio/mpeg";
  }
  if (comeca(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (texto(bytes, 4, 8) === "ftyp") {
    const marca = texto(bytes, 8, 12);
    if (marca.startsWith("M4A") || marca.startsWith("M4B")) return "audio/mp4";
    if (marca.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  // Word/Excel novos são um .zip por dentro; os antigos, um "OLE".
  if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  if (comeca(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "application/x-ole";
  return null;
}

export type MimeDecidido =
  { ok: true; mime: string; ext: string } | { ok: false; motivo: string; invalido?: boolean };

function limpo(m: unknown): string {
  return String(m ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * Junta o que o arquivo É (pelos bytes) com o que disseram que ele é, e
 * decide se pode ser guardado e com qual tipo.
 *
 * REGRA: os bytes mandam. A etiqueta só é usada para separar os documentos
 * que não têm assinatura própria (Word novo e Excel novo são .zip por dentro;
 * texto não tem assinatura nenhuma).
 */
export function decidirMime(bytes: Uint8Array, declarado: unknown, tipo: TipoMidia): MimeDecidido {
  const dito = limpo(declarado);
  const real = farejarMime(bytes);

  if (real === "application/zip") {
    if (
      dito === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      dito === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return { ok: true, mime: dito, ext: extensaoDoMime(dito) };
    }
    return { ok: false, motivo: "Arquivo compactado não é aceito." };
  }
  if (real === "application/x-ole") {
    if (dito === "application/msword" || dito === "application/vnd.ms-excel") {
      return { ok: true, mime: dito, ext: extensaoDoMime(dito) };
    }
    return { ok: false, motivo: "Tipo de documento não reconhecido." };
  }

  if (real) {
    // Um "PDF" que não começa como PDF está corrompido ou não é PDF.
    if (dito === "application/pdf" && real !== "application/pdf") {
      return { ok: false, motivo: "O PDF está corrompido ou não é um PDF.", invalido: true };
    }
    // WhatsApp grava o áudio de voz como .ogg; um vídeo .webm sem imagem
    // que chegou como áudio também é tratado como áudio.
    if (tipo === "audio" && real === "video/webm")
      return { ok: true, mime: "audio/webm", ext: "webm" };
    if (tipo === "audio" && real === "video/mp4")
      return { ok: true, mime: "audio/mp4", ext: "m4a" };
    return { ok: true, mime: real, ext: extensaoDoMime(real) };
  }

  // Sem assinatura: só texto puro e CSV, e só quando declarados assim.
  if (dito === "text/plain" || dito === "text/csv") {
    return { ok: true, mime: dito, ext: extensaoDoMime(dito) };
  }
  if (dito === "application/pdf") {
    return { ok: false, motivo: "O PDF está corrompido ou não é um PDF.", invalido: true };
  }
  return { ok: false, motivo: "Formato de arquivo não reconhecido.", invalido: true };
}

/** Os documentos que a tela consegue mostrar ou oferecer para baixar. */
export function ehDocumentoAceito(mime: string): boolean {
  return MIMES_DE_DOCUMENTO.has(mime);
}

/**
 * Só baixamos de endereço da PRÓPRIA UAZAPI.
 *
 * O endereço do arquivo vem na resposta de um serviço de fora. Se o servidor
 * baixasse de qualquer endereço que lhe mandassem, alguém poderia usá-lo para
 * bater em portas internas — é o entregador que aceita levar pacote para
 * qualquer endereço escrito num papel, inclusive o cofre do banco. Então: só
 * https, e só o mesmo endereço da UAZAPI configurada.
 */
export function enderecoConfiavel(url: unknown, baseUrl: string): boolean {
  try {
    const alvo = new URL(String(url ?? ""));
    const base = new URL(baseUrl);
    return alvo.protocol === "https:" && alvo.host === base.host;
  } catch {
    return false;
  }
}

/**
 * O nome bonito do arquivo, tirado do caminho dentro da pasta.
 *
 * O caminho é `loja/conversa/<carimbo>-<nome>`. O carimbo (hora + sorteio)
 * existe para dois arquivos de mesmo nome não se atropelarem, mas não é para
 * a pessoa ler.
 */
export function nomeNoCaminho(caminho: string | null | undefined): string | null {
  const ultimo = String(caminho ?? "")
    .split("/")
    .pop();
  if (!ultimo) return null;
  const semCarimbo = ultimo.replace(/^\d{10,}-[a-z0-9]{1,8}-/, "");
  return semCarimbo || ultimo;
}

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { caminhoDaMidia, conferirArquivo, type TipoMidia } from "./midia";

/**
 * A PASTA DOS ARQUIVOS DO CHAT, do lado do servidor.
 *
 * A pasta é FECHADA. Ninguém abre um arquivo daqui digitando o endereço: cada
 * um é entregue por um endereço assinado, com hora para vencer — o cupom do
 * estacionamento, que vale hoje e amanhã não abre mais a cancela.
 *
 * Por isso o que fica guardado na mensagem é o CAMINHO, nunca o endereço. Se
 * guardássemos o endereço, daqui a uma hora o lojista abriria a conversa e
 * veria a foto do comprovante quebrada.
 */

export const BALDE = "crm-chat-media";

/** Quanto tempo o endereço vale. Uma hora dá para ver, ouvir e baixar. */
const VALIDADE_SEGUNDOS = 60 * 60;

/** O endereço assinado de um arquivo. `null` quando não dá para assinar. */
export async function enderecoAssinado(
  caminho: string | null | undefined,
  segundos = VALIDADE_SEGUNDOS,
): Promise<string | null> {
  const p = String(caminho ?? "").trim();
  if (!p) return null;
  const { data, error } = await supabaseAdmin.storage.from(BALDE).createSignedUrl(p, segundos);
  if (error) {
    console.error("[crm/midia] não consegui assinar o endereço:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Assina vários de uma vez, para a tela não abrir uma ligação por balão.
 *
 * Uma conversa com 40 fotos abriria 40 conversas com o armazenamento se cada
 * balão pedisse a sua — é o garçom indo à cozinha 40 vezes para buscar 40
 * pratos da mesma mesa.
 */
export async function enderecosAssinados(caminhos: string[]): Promise<Map<string, string>> {
  const limpos = Array.from(new Set(caminhos.map((c) => String(c ?? "").trim()).filter(Boolean)));
  const mapa = new Map<string, string>();
  if (limpos.length === 0) return mapa;

  const { data, error } = await supabaseAdmin.storage
    .from(BALDE)
    .createSignedUrls(limpos, VALIDADE_SEGUNDOS);

  if (error) {
    console.error("[crm/midia] não consegui assinar os endereços:", error.message);
    return mapa;
  }

  for (const item of data ?? []) {
    if (item?.path && item?.signedUrl) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

export type ArquivoGuardado = { caminho: string; tipo: TipoMidia; tamanho: number };

/**
 * Guarda na pasta o arquivo que saiu do painel.
 *
 * O arquivo chega escrito como texto (base64) porque é assim que ele
 * atravessa a chamada do navegador para o servidor. Aqui ele volta a ser
 * arquivo e é conferido ANTES de encostar na pasta: tipo aceito e tamanho
 * dentro do limite. Dizer não aqui é dizer não enquanto o lojista ainda está
 * olhando a tela — se deixássemos passar, a recusa viria do WhatsApp depois,
 * com ele já achando que tinha mandado.
 */
export async function guardarArquivoDoPainel(entrada: {
  tenantId: string;
  conversationId: string;
  nome: string;
  mime: string;
  base64: string;
}): Promise<ArquivoGuardado> {
  const cru = String(entrada.base64 ?? "");
  // O navegador manda "data:audio/webm;base64,AAAA..." — o miolo é o que
  // interessa.
  const miolo = cru.includes(",") ? cru.slice(cru.indexOf(",") + 1) : cru;
  if (!miolo) throw new Error("Arquivo vazio.");

  let bytes: Uint8Array;
  try {
    const binario = atob(miolo);
    bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  } catch {
    throw new Error("Não consegui ler o arquivo. Tente enviar de novo.");
  }

  const conferido = conferirArquivo(entrada.mime, bytes.byteLength);
  if (!conferido.ok) throw new Error(conferido.motivo);

  const caminho = caminhoDaMidia(entrada.tenantId, entrada.conversationId, entrada.nome);

  const { error } = await supabaseAdmin.storage.from(BALDE).upload(caminho, bytes, {
    contentType: String(entrada.mime),
    upsert: false,
  });
  if (error) throw new Error(`Não consegui guardar o arquivo: ${error.message}`);

  return { caminho, tipo: conferido.tipo, tamanho: bytes.byteLength };
}

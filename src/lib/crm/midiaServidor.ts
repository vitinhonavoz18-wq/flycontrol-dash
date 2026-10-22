import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { caminhoDaMidia, conferirArquivo, ehTipoMidia, type TipoMidia } from "./midia";
import { crm } from "./db";
import { configUazapi, baixarMidiaDaMensagem } from "@/lib/whatsapp/uazapi";
import {
  LIMITE_DOWNLOAD_BYTES,
  decidirMime,
  enderecoConfiavel,
  nomeNoCaminho,
} from "./midiaRecuperada";
import type { ResultadoMidia } from "./filaDeMidia";

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

const BALDE = "crm-chat-media";

/** Quanto tempo o endereço vale. Uma hora dá para ver, ouvir e baixar. */
const VALIDADE_SEGUNDOS = 60 * 60;

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

// ---------------------------------------------------------------------------
// BUSCAR NO WHATSAPP O ARQUIVO QUE NUNCA FOI GUARDADO
// ---------------------------------------------------------------------------

/**
 * O mesmo formato que a tela usa (`filaDeMidia.ts`). `definitivo: true` quer
 * dizer que tentar de novo não vai adiantar (o WhatsApp não guarda mais o
 * arquivo, grande demais, corrompido): a tela para de insistir e explica.
 */
export type MidiaRecuperada = ResultadoMidia;

const NOME_POR_TIPO: Record<TipoMidia, string> = {
  audio: "audio",
  image: "foto",
  video: "video",
  document: "documento",
};

function falha(motivo: string, definitivo: boolean): MidiaRecuperada {
  return { ok: false, motivo, definitivo };
}

/**
 * Baixa com teto de tamanho e de tempo.
 *
 * O teto é conferido DURANTE o download, não depois: se o arquivo tiver 300
 * MB, paramos no 21º MB em vez de encher a memória do servidor para só então
 * descobrir que não cabe.
 */
async function baixarComLimite(
  url: string,
): Promise<
  | { ok: true; bytes: Uint8Array; mime: string | null }
  | { ok: false; motivo: string; definitivo: boolean }
> {
  let r: Response;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    return {
      ok: false,
      motivo: "O WhatsApp demorou demais para entregar o arquivo.",
      definitivo: false,
    };
  }
  if (!r.ok || !r.body) {
    return {
      ok: false,
      motivo: "O WhatsApp não tem mais este arquivo.",
      definitivo: r.status === 404 || r.status === 410,
    };
  }
  const declarado = Number(r.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_DOWNLOAD_BYTES) {
    return {
      ok: false,
      motivo: "Arquivo grande demais para abrir no painel. Veja no celular.",
      definitivo: true,
    };
  }

  const leitor = r.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_DOWNLOAD_BYTES) {
      await leitor.cancel().catch(() => undefined);
      return {
        ok: false,
        motivo: "Arquivo grande demais para abrir no painel. Veja no celular.",
        definitivo: true,
      };
    }
    pedacos.push(value);
  }
  if (total === 0) return { ok: false, motivo: "O arquivo veio vazio.", definitivo: true };

  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return { ok: true, bytes, mime: r.headers.get("content-type") };
}

function base64ParaBytes(b64: string): Uint8Array | null {
  try {
    const miolo = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
    const bin = atob(miolo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Entrega o endereço para ouvir/ver o arquivo de UMA mensagem, buscando no
 * WhatsApp e guardando na pasta da loja se ainda não estiver lá.
 *
 * QUEM CHAMA JÁ PASSOU PELO PORTEIRO e manda o `tenantId` CONFERIDO. A
 * mensagem é procurada com a loja junto: o número de uma mensagem de outra
 * loja simplesmente não é encontrado.
 *
 * DUAS TELAS ABERTAS AO MESMO TEMPO não criam dois arquivos: só grava o
 * caminho quem chegar primeiro (`media_path IS NULL` na própria gravação); o
 * segundo apaga a cópia dele e usa a do primeiro.
 */
export async function recuperarMidiaDaMensagem(
  tenantId: string,
  messageId: string,
): Promise<MidiaRecuperada> {
  const { data: msg, error } = await crm("crm_messages")
    .select("id, conversation_id, media_type, media_path, media_url, external_id")
    .eq("tenant_id", tenantId)
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    console.error("[crm/midia] falha ao ler a mensagem:", error.message);
    return falha("Não consegui abrir o arquivo agora. Tente de novo.", false);
  }
  if (!msg) return falha("Mensagem não encontrada nesta loja.", true);

  if (msg.media_path) {
    const mapa = await enderecosAssinados([msg.media_path]);
    const url = mapa.get(msg.media_path);
    return url
      ? { ok: true, url, caminho: msg.media_path, nome: nomeNoCaminho(msg.media_path) ?? "arquivo" }
      : falha("Não consegui abrir o arquivo agora. Tente de novo.", false);
  }

  const tipo: TipoMidia | null = ehTipoMidia(msg.media_type) ? msg.media_type : null;
  if (!tipo) return falha("Esta mensagem não tem arquivo.", true);

  const cfg = configUazapi();
  if (!cfg) return falha("A integração com o WhatsApp não está configurada.", false);
  let bytes: Uint8Array | null = null;
  let mimeDeclarado: string | null = null;
  let ultimoMotivo = "O WhatsApp não tem mais este arquivo.";
  let definitivo = true;

  // 1º caminho: pedir à UAZAPI pelo número da mensagem. É o que funciona para
  // os milhares de mensagens que chegaram sem arquivo nenhum.
  if (msg.external_id) {
    const { data: cofre } = await crm("whatsapp_instance_secrets")
      .select("instance_token")
      .eq("tenant_id", tenantId)
      .eq("provider", "uazapi")
      .maybeSingle();

    if (!cofre?.instance_token) {
      ultimoMotivo = "O WhatsApp da loja não está conectado. Conecte para ver os arquivos.";
      definitivo = false;
    } else {
      const r = await baixarMidiaDaMensagem(String(cofre.instance_token), String(msg.external_id), {
        mp3: tipo === "audio",
      });
      if (!r.ok) {
        // Nunca repassar o texto cru da UAZAPI para a tela: pode carregar
        // detalhe interno. Fica no registro do servidor, sem token.
        console.warn(
          `[crm/midia] UAZAPI recusou o download (loja ${tenantId}, msg ${messageId}): ${r.status ?? "-"} ${r.erro}`,
        );
        definitivo = !r.podeTentarDeNovo;
        ultimoMotivo = r.podeTentarDeNovo
          ? "O WhatsApp não respondeu agora. Tente de novo."
          : "O WhatsApp não tem mais este arquivo.";
      } else if (r.dados.base64) {
        bytes = base64ParaBytes(r.dados.base64);
        mimeDeclarado = r.dados.mimetype;
      } else if (r.dados.fileURL && enderecoConfiavel(r.dados.fileURL, cfg.baseUrl)) {
        const b = await baixarComLimite(r.dados.fileURL);
        if (b.ok) {
          bytes = b.bytes;
          mimeDeclarado = r.dados.mimetype ?? b.mime;
        } else {
          ultimoMotivo = b.motivo;
          definitivo = b.definitivo;
        }
      } else if (r.dados.fileURL) {
        console.warn(
          `[crm/midia] endereço fora da UAZAPI recusado (loja ${tenantId}, msg ${messageId})`,
        );
      }
    }
  }

  // 2º caminho: mensagens antigas que já tinham um endereço da UAZAPI salvo.
  // Só vale se o endereço for da própria UAZAPI configurada.
  if (!bytes && msg.media_url && enderecoConfiavel(msg.media_url, cfg.baseUrl)) {
    const b = await baixarComLimite(String(msg.media_url));
    if (b.ok) {
      bytes = b.bytes;
      mimeDeclarado = b.mime;
    } else if (definitivo) {
      // Se o primeiro caminho disse "tente de novo", esse motivo vale mais.
      ultimoMotivo = b.motivo;
      definitivo = b.definitivo;
    }
  }

  if (!bytes) return falha(ultimoMotivo, definitivo);

  const decidido = decidirMime(bytes, mimeDeclarado, tipo);
  if (!decidido.ok) return falha(decidido.motivo, true);

  const nome = `${NOME_POR_TIPO[tipo]}-${messageId.slice(0, 8)}.${decidido.ext}`;
  const caminho = caminhoDaMidia(tenantId, String(msg.conversation_id), nome);

  const { error: erroUpload } = await supabaseAdmin.storage.from(BALDE).upload(caminho, bytes, {
    contentType: decidido.mime,
    upsert: false,
  });
  if (erroUpload) {
    console.error(
      `[crm/midia] não consegui guardar (loja ${tenantId}, msg ${messageId}):`,
      erroUpload.message,
    );
    const tipoRecusado = /mime|type/i.test(erroUpload.message);
    return falha(
      tipoRecusado
        ? "Este tipo de arquivo ainda não pode ser aberto no painel. Veja no celular."
        : "Não consegui guardar o arquivo agora. Tente de novo.",
      tipoRecusado,
    );
  }

  const { data: gravadas, error: erroGrava } = await crm("crm_messages")
    .update({ media_path: caminho, updated_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .is("media_path", null)
    .select("id");

  let caminhoFinal = caminho;
  if (erroGrava || !gravadas || gravadas.length === 0) {
    // Outra tela guardou primeiro (ou a gravação falhou): a nossa cópia sobra.
    await supabaseAdmin.storage
      .from(BALDE)
      .remove([caminho])
      .catch(() => undefined);
    const { data: atual } = await crm("crm_messages")
      .select("media_path")
      .eq("id", messageId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!atual?.media_path) {
      if (erroGrava) console.error("[crm/midia] falha ao registrar o caminho:", erroGrava.message);
      return falha("Não consegui guardar o arquivo agora. Tente de novo.", false);
    }
    caminhoFinal = String(atual.media_path);
  }

  const mapa = await enderecosAssinados([caminhoFinal]);
  const url = mapa.get(caminhoFinal);
  if (!url) return falha("Não consegui abrir o arquivo agora. Tente de novo.", false);
  return { ok: true, url, caminho: caminhoFinal, nome: nomeNoCaminho(caminhoFinal) ?? nome };
}

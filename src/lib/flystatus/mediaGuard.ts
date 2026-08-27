/**
 * O porteiro da imagem que vai para o cliente.
 *
 * O servidor do FlyControl vai buscar a arte antes de mandá-la pelo WhatsApp.
 * Isso é poderoso e perigoso ao mesmo tempo: se alguém conseguisse escolher o
 * endereço, faria o NOSSO servidor bater em endereços internos que ninguém de
 * fora alcança — é como pedir ao entregador da casa para buscar um envelope
 * dentro do cofre do escritório.
 *
 * Por isso duas travas:
 *
 * 1. Só endereços de casas conhecidas (o armazenamento do próprio sistema).
 *    Nada de IP solto, nada de "localhost", nada de rede interna.
 * 2. O que voltar precisa mesmo ser uma imagem, do tamanho de uma imagem.
 *    Uma página de erro de 404 não pode virar "arte" e sair para o cliente.
 */

import { HOST_ARTES_PADRAO } from "./mensagem";

export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** 5 MB. Acima disso o WhatsApp costuma recusar, e a espera não compensa. */
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

export type ImagemPronta = {
  bytes: ArrayBuffer;
  tipo: string;
  tamanho: number;
};

export type FalhaDaImagem =
  | "endereco_invalido"
  | "endereco_nao_autorizado"
  | "nao_encontrada"
  | "tipo_invalido"
  | "muito_grande"
  | "vazia"
  | "tempo_esgotado"
  | "falha_de_rede";

export const MOTIVO_LEGIVEL: Record<FalhaDaImagem, string> = {
  endereco_invalido: "O endereço da arte não é válido.",
  endereco_nao_autorizado: "A arte precisa estar guardada no armazenamento do próprio sistema.",
  nao_encontrada: "Não encontrei a arte no endereço configurado.",
  tipo_invalido: "O arquivo da arte não é uma imagem JPG, PNG ou WebP.",
  muito_grande: "A arte é grande demais para o WhatsApp (limite de 5 MB).",
  vazia: "O arquivo da arte está vazio.",
  tempo_esgotado: "O armazenamento demorou demais para responder.",
  falha_de_rede: "Não consegui alcançar o armazenamento da arte.",
};

/**
 * Nomes de máquina que nunca podem ser buscados, mesmo que apareçam dentro
 * de um endereço aparentemente normal.
 */
const PROIBIDOS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
];

/** Faixas de IP que só existem dentro de uma rede — nunca na internet. */
function ehIpPrivado(host: string): boolean {
  const partes = host.split(".");
  if (partes.length !== 4 || partes.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const [a, b] = partes.map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * As casas conhecidas: o armazenamento do próprio projeto.
 *
 * Sai do endereço do Supabase configurado no servidor, para não existir uma
 * lista escrita à mão que alguém esquece de atualizar ao trocar de projeto.
 * `FLYSTATUS_MEDIA_HOSTS` permite acrescentar um CDN próprio no futuro.
 */
export function hostsPermitidos(env: Record<string, string | undefined>): string[] {
  const lista = new Set<string>();

  // As artes que o sistema entrega de fábrica moram em outro armazenamento,
  // que não é o do banco atual. Sem esta linha, o porteiro recusaria a
  // própria imagem padrão do FlyControl.
  lista.add(HOST_ARTES_PADRAO);

  for (const chave of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    const bruto = env[chave]?.trim();
    if (!bruto) continue;
    try {
      lista.add(new URL(bruto).hostname.toLowerCase());
    } catch {
      // Variável mal preenchida não pode derrubar o envio: só não entra.
    }
  }

  const extras = env.FLYSTATUS_MEDIA_HOSTS?.trim();
  if (extras) {
    for (const h of extras.split(",")) {
      const limpo = h.trim().toLowerCase();
      if (limpo) lista.add(limpo);
    }
  }

  return Array.from(lista);
}

export type VerificacaoDoEndereco =
  { ok: true; url: URL } | { ok: false; motivo: "endereco_invalido" | "endereco_nao_autorizado" };

/**
 * O endereço pode ser buscado pelo servidor?
 *
 * Separado da rede de propósito: é a regra que decide se abrimos a porta, e
 * precisa ser testável sem chamar nada.
 */
export function conferirEndereco(
  bruto: string | null | undefined,
  permitidos: string[],
): VerificacaoDoEndereco {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: false, motivo: "endereco_invalido" };

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, motivo: "endereco_invalido" };
  }

  if (url.protocol !== "https:") return { ok: false, motivo: "endereco_invalido" };

  const host = url.hostname.toLowerCase();
  if (PROIBIDOS.includes(host)) return { ok: false, motivo: "endereco_nao_autorizado" };
  if (ehIpPrivado(host)) return { ok: false, motivo: "endereco_nao_autorizado" };
  // Endereço com usuário/senha embutidos é truque clássico para o host
  // parecer um e ser outro: https://storage.confiavel.com@servidor-mau/
  if (url.username || url.password) return { ok: false, motivo: "endereco_nao_autorizado" };

  // Sem lista configurada, nada passa. Fechar a porta é o padrão seguro:
  // uma variável de ambiente esquecida não pode virar porta escancarada.
  const autorizado = permitidos.some((p) => host === p || host.endsWith(`.${p}`));
  if (!autorizado) return { ok: false, motivo: "endereco_nao_autorizado" };

  return { ok: true, url };
}

/** O que voltou do armazenamento é mesmo uma imagem utilizável? */
export function conferirConteudo(
  tipo: string | null,
  tamanho: number,
): { ok: true; tipo: string } | { ok: false; motivo: FalhaDaImagem } {
  const limpo = (tipo ?? "").split(";")[0].trim().toLowerCase();
  if (!(TIPOS_ACEITOS as readonly string[]).includes(limpo)) {
    return { ok: false, motivo: "tipo_invalido" };
  }
  if (tamanho <= 0) return { ok: false, motivo: "vazia" };
  if (tamanho > TAMANHO_MAXIMO_BYTES) return { ok: false, motivo: "muito_grande" };
  return { ok: true, tipo: limpo };
}

/**
 * Busca a arte e devolve os bytes, ou o motivo de não ter dado.
 *
 * O tempo limite existe porque o pedido do cliente não pode ficar preso
 * esperando um armazenamento lento: melhor avisar "não consegui" em 10
 * segundos do que deixar a tela girando.
 */
export async function buscarImagem(
  endereco: string | null | undefined,
  env: Record<string, string | undefined>,
): Promise<{ ok: true; imagem: ImagemPronta } | { ok: false; motivo: FalhaDaImagem }> {
  const verificacao = conferirEndereco(endereco, hostsPermitidos(env));
  if (!verificacao.ok) return { ok: false, motivo: verificacao.motivo };

  const corte = AbortSignal.timeout(10_000);
  let resposta: Response;
  try {
    resposta = await fetch(verificacao.url.toString(), { signal: corte, redirect: "follow" });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return { ok: false, motivo: nome === "TimeoutError" ? "tempo_esgotado" : "falha_de_rede" };
  }

  if (!resposta.ok) return { ok: false, motivo: "nao_encontrada" };

  const bytes = await resposta.arrayBuffer();
  // O tipo declarado pode mentir; o tamanho real, não. Por isso a conferência
  // usa o que chegou, e não o cabeçalho `content-length`.
  const conteudo = conferirConteudo(resposta.headers.get("content-type"), bytes.byteLength);
  if (!conteudo.ok) return { ok: false, motivo: conteudo.motivo };

  return {
    ok: true,
    imagem: { bytes, tipo: conteudo.tipo, tamanho: bytes.byteLength },
  };
}

/** Converte para base64, que é como a maioria das APIs de WhatsApp recebe. */
export function paraBase64(bytes: ArrayBuffer): string {
  const brutos = new Uint8Array(bytes);
  let texto = "";
  // Em pedaços: passar um array de milhões de posições de uma vez para
  // `fromCharCode` estoura a pilha do JavaScript.
  const PASSO = 8192;
  for (let i = 0; i < brutos.length; i += PASSO) {
    texto += String.fromCharCode(...brutos.subarray(i, i + PASSO));
  }
  return btoa(texto);
}

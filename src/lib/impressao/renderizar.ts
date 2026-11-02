/**
 * Transforma as linhas da comanda no formato que cada caminho de impressão
 * entende.
 *
 * - `paraTexto`: texto puro, uma linha por linha. Serve para copiar, para o
 *   diagnóstico e para impressoras que só entendem texto.
 * - `paraEscPos`: os comandos ESC/POS — a "língua" das impressoras térmicas
 *   (Epson e as compatíveis). É o que um envio direto à impressora (PrintNode
 *   ou cabo/USB pelo navegador) precisaria mandar.
 *
 * ATENÇÃO: hoje NENHUM caminho do sistema manda ESC/POS para impressora. A
 * comanda vai pelo navegador (ver `ComandaImpressa.tsx`). Este conversor está
 * pronto e testado para quando um envio direto for ligado — e até lá não é
 * usado para imprimir. O desenho na tela usa as mesmas linhas, então a prévia
 * mostra exatamente as letras que cada linha teria.
 */

import type { Linha } from "./comanda";
import type { PaginaDeCodigo, PerfilDeImpressao } from "./perfil";
import { estiloDeImpressao, larguraDaAreaMm } from "./papel";
import { removerAcentos } from "./texto";

export function paraTexto(linhas: Linha[], quebra: "lf" | "crlf" = "lf"): string {
  const fim = quebra === "crlf" ? "\r\n" : "\n";
  return linhas.map((l) => l.texto).join(fim) + fim;
}

/**
 * As letras acentuadas em cada tabela da impressora. Os números foram tirados
 * das tabelas oficiais (CP860 e CP850), não digitados de memória.
 */
const TABELAS: Record<PaginaDeCodigo, Record<string, number>> = {
  cp860: {
    Á: 0x86,
    À: 0x91,
    Â: 0x8f,
    Ã: 0x8e,
    É: 0x90,
    È: 0x92,
    Ê: 0x89,
    Í: 0x8b,
    Ì: 0x98,
    Ó: 0x9f,
    Ò: 0xa9,
    Ô: 0x8c,
    Õ: 0x99,
    Ú: 0x96,
    Ù: 0x9d,
    Ü: 0x9a,
    Ç: 0x80,
    Ñ: 0xa5,
    á: 0xa0,
    à: 0x85,
    â: 0x83,
    ã: 0x84,
    é: 0x82,
    è: 0x8a,
    ê: 0x88,
    í: 0xa1,
    ì: 0x8d,
    ó: 0xa2,
    ò: 0x95,
    ô: 0x93,
    õ: 0x94,
    ú: 0xa3,
    ù: 0x97,
    ü: 0x81,
    ç: 0x87,
    ñ: 0xa4,
    º: 0xa7,
    ª: 0xa6,
    "°": 0xf8,
  },
  cp850: {
    Á: 0xb5,
    À: 0xb7,
    Â: 0xb6,
    Ã: 0xc7,
    Ä: 0x8e,
    É: 0x90,
    È: 0xd4,
    Ê: 0xd2,
    Ë: 0xd3,
    Í: 0xd6,
    Ì: 0xde,
    Î: 0xd7,
    Ï: 0xd8,
    Ó: 0xe0,
    Ò: 0xe3,
    Ô: 0xe2,
    Õ: 0xe5,
    Ö: 0x99,
    Ú: 0xe9,
    Ù: 0xeb,
    Û: 0xea,
    Ü: 0x9a,
    Ç: 0x80,
    Ñ: 0xa5,
    á: 0xa0,
    à: 0x85,
    â: 0x83,
    ã: 0xc6,
    ä: 0x84,
    é: 0x82,
    è: 0x8a,
    ê: 0x88,
    ë: 0x89,
    í: 0xa1,
    ì: 0x8d,
    î: 0x8c,
    ï: 0x8b,
    ó: 0xa2,
    ò: 0x95,
    ô: 0x93,
    õ: 0xe4,
    ö: 0x94,
    ú: 0xa3,
    ù: 0x97,
    û: 0x96,
    ü: 0x81,
    ç: 0x87,
    ñ: 0xa4,
    º: 0xa7,
    ª: 0xa6,
    "°": 0xf8,
  },
};

/**
 * Número da tabela no comando `ESC t n`, na numeração da Epson — seguida pela
 * maioria das compatíveis em modo ESC/POS. Marcas com linguagem própria
 * (Bematech em modo ESC/Bema, Daruma em modo nativo) usam outros números:
 * por isso o teste de alinhamento imprime uma linha só de acentos.
 */
export const NUMERO_DA_TABELA: Record<PaginaDeCodigo, number> = { cp850: 2, cp860: 3 };

/** Converte uma letra para o byte da tabela; o que não existe vira "?". */
export function codificar(texto: string, pagina: PaginaDeCodigo | null): number[] {
  const bytes: number[] = [];
  const tabela = pagina ? TABELAS[pagina] : null;
  const fonte = tabela ? texto.normalize("NFC") : removerAcentos(texto);
  for (const letra of fonte) {
    const c = letra.codePointAt(0) ?? 0x3f;
    if (c >= 0x20 && c <= 0x7e) bytes.push(c);
    else if (tabela && tabela[letra] !== undefined) bytes.push(tabela[letra]);
    else {
      // Sem a letra na tabela: tenta sem acento antes de desistir.
      const simples = removerAcentos(letra);
      if (simples) for (const s of simples) bytes.push(s.charCodeAt(0));
      else bytes.push(0x3f);
    }
  }
  return bytes;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const COMANDOS = {
  iniciar: [ESC, 0x40],
  tabela: (n: number) => [ESC, 0x74, n],
  negrito: (ligado: boolean) => [ESC, 0x45, ligado ? 1 : 0],
  /** `ESC !` — modo de impressão: 0x08 negrito, 0x10 altura dupla. */
  modo: (bits: number) => [ESC, 0x21, bits],
  avancarLinhas: (n: number) => [ESC, 0x64, n],
  /** `GS V 66 0` — avança até a lâmina e corta parcialmente. */
  cortar: [GS, 0x56, 0x42, 0x00],
  /** `ESC p 0 25 250` — pulso no conector da gaveta, pino 2. */
  gaveta: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

/**
 * Comandos ESC/POS da comanda.
 *
 * Quebra de linha é sempre só LF (0x0A): é o que o ESC/POS define. Mandar
 * CR+LF faz algumas impressoras (com "avanço automático no CR" ligado) pular
 * duas linhas a cada linha; mandar só CR faz imprimir tudo por cima da mesma
 * linha — um dos jeitos de a comanda sair "toda junta".
 *
 * O título usa altura dupla, mas NÃO largura dupla: largura dupla faria a
 * linha ter o dobro de letras do papel e quebrar no meio.
 */
export function paraEscPos(linhas: Linha[], perfil: PerfilDeImpressao): Uint8Array {
  const pagina = perfil.acentos ? perfil.paginaDeCodigo : null;
  const saida: number[] = [...COMANDOS.iniciar];
  if (pagina) saida.push(...COMANDOS.tabela(NUMERO_DA_TABELA[pagina]));

  for (const linha of linhas) {
    if (linha.estilo === "titulo") saida.push(...COMANDOS.modo(0x08 | 0x10));
    else if (linha.estilo === "negrito" || linha.estilo === "destaque") {
      saida.push(...COMANDOS.negrito(true));
    }
    saida.push(...codificar(linha.texto, pagina), LF);
    if (linha.estilo === "titulo") saida.push(...COMANDOS.modo(0));
    else if (linha.estilo !== "normal") saida.push(...COMANDOS.negrito(false));
  }

  if (perfil.cortarPapel) {
    // As linhas em branco do fim já vêm da comanda (`linhasNoFinal`); aqui só
    // mais uma, para a lâmina nunca pegar a última linha escrita.
    saida.push(...COMANDOS.avancarLinhas(1), ...COMANDOS.cortar);
  }
  if (perfil.abrirGaveta) saida.push(...COMANDOS.gaveta);
  return Uint8Array.from(saida);
}

/** Base64 — o formato em que serviços como o PrintNode recebem dados brutos. */
export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

// ─────────────────────────────────────────────────────────────────────────
// HTML — o documento que vai para a janela de impressão do navegador
// ─────────────────────────────────────────────────────────────────────────

/**
 * Troca os caracteres que o HTML entende como comando por versões inofensivas.
 *
 * O texto da comanda vem do cliente (nome, observação). Sem isto, uma
 * observação escrita como código seria EXECUTADA na tela da loja — como
 * deixar o cliente escrever direto no caderno do caixa em vez de anotar o
 * que ele falou.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Só endereço de imagem comum (http/https) entra como logo. */
function logoSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

/**
 * A comanda como uma página inteira, para imprimir num quadro separado (sem
 * menus, margens ou botões do sistema por perto). Usa as mesmas regras de
 * estilo da prévia (`estiloDeImpressao`), então sai igual ao que se vê na tela.
 */
export function paraHtml(
  linhas: Linha[],
  perfil: PerfilDeImpressao,
  opcoes: { titulo?: string; logoUrl?: string | null } = {},
): string {
  const grade = {
    colunas: perfil.colunas,
    margemMm: perfil.margemMm,
    espacamento: perfil.espacamento,
  };
  const logo = perfil.mostrarLogo ? logoSegura(opcoes.logoUrl) : null;
  const corpo = linhas
    .map((l) => `<div class="l l-${l.estilo}">${escaparHtml(l.texto) || " "}</div>`)
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escaparHtml(opcoes.titulo ?? "Comanda")}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
.comanda-folha { width: ${larguraDaAreaMm(perfil.papel)}mm; max-width: 100%; padding: ${perfil.margemMm}mm; box-sizing: border-box; }
.comanda-logo { display: block; margin: 0 auto 2mm auto; max-height: 24mm; max-width: 80%; object-fit: contain; }
${estiloDeImpressao(perfil.papel, grade)}
</style>
</head>
<body>
<div class="print-area comanda-folha">
${logo ? `<img class="comanda-logo" src="${escaparHtml(logo)}" alt="">` : ""}
<div class="comanda-texto">
${corpo}
</div>
</div>
</body>
</html>`;
}

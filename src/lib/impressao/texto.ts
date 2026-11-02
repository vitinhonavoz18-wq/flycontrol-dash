/**
 * As regras de texto da comanda: limpar, quebrar e alinhar.
 *
 * A comanda é montada como uma GRADE de letras de mesma largura — cada linha
 * tem no máximo `largura` letras. É como o papel quadriculado do caderno de
 * pedidos: cada letra ocupa um quadradinho, e a linha acaba onde o papel acaba.
 * Assim qualquer impressora (até a mais simples, que só entende texto) recebe
 * linhas que cabem nela, e o que sai no papel é o mesmo que aparece na tela.
 *
 * Funções puras: não dependem de tela, navegador nem banco — por isso dá para
 * testar cada uma isoladamente.
 */

/**
 * Símbolos comuns que não existem nas tabelas de letras das impressoras
 * térmicas, trocados por equivalentes que existem.
 */
const TROCAS: Record<string, string> = {
  "•": "-",
  "·": "-",
  "–": "-",
  "—": "-",
  "‒": "-",
  "−": "-",
  "“": '"',
  "”": '"',
  "„": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
  "…": "...",
  "€": "EUR",
  "™": "",
  "®": "",
  "©": "",
  " ": " ", // espaço que não quebra
  " ": " ",
  " ": " ",
};

/**
 * Letras que ocupam exatamente um quadradinho: o básico do teclado (ASCII) e
 * o bloco Latin-1 (acentos do português, º, ª, °). Fora disso — emoji, letras
 * de outros alfabetos — a impressora térmica não tem como desenhar, e algumas
 * ocupam dois quadradinhos na tela, desalinhando a comanda inteira.
 */
const LETRA_IMPRIMIVEL = /[ -~¡-ÿ\n]/u;

/**
 * Deixa o texto pronto para a grade:
 * - junta acento solto à letra (NFC);
 * - padroniza quebra de linha (`\r\n` do Windows e `\r` do Mac antigo viram `\n`);
 * - TAB vira espaço;
 * - troca símbolos tipográficos por equivalentes simples;
 * - tira emoji e caracteres de controle.
 */
export function limparTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const bruto = String(valor).normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  let saida = "";
  for (const letra of bruto) {
    const trocada = TROCAS[letra] ?? letra;
    for (const l of trocada) {
      if (LETRA_IMPRIMIVEL.test(l)) saida += l;
    }
  }
  // Espaços repetidos dentro da linha viram um só; espaços na beira saem.
  return saida
    .split("\n")
    .map((linha) => linha.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Tira os acentos: "Observação" vira "Observacao".
 *
 * Para a impressora configurada como "Somente texto" no Windows: ela recebe as
 * letras numa tabela e imprime em outra, e todo acento sai como símbolo
 * estranho ("Observa��o"). Sem acento, sai legível em qualquer uma.
 */
export function removerAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/º/g, "o")
    .replace(/ª/g, "a")
    .replace(/°/g, "o")
    .replace(/[^ -~\n]/g, "");
}

/**
 * Quebra um texto em linhas de no máximo `largura` letras, sem cortar
 * palavra no meio — a não ser que a palavra sozinha não caiba (um endereço
 * de e-mail, um código), aí ela é partida.
 *
 * As quebras de linha que o cliente digitou são respeitadas: "sem cebola" e
 * "bem passado" em linhas separadas continuam separadas no papel.
 *
 * `recuo` são os espaços no começo das linhas seguintes (para o texto ficar
 * alinhado embaixo do primeiro). `recuoInicial` é o da primeira linha.
 */
export function quebrarTexto(
  texto: string,
  largura: number,
  opcoes: { recuo?: number; recuoInicial?: number } = {},
): string[] {
  largura = Math.max(1, Math.floor(largura));
  // Recuo maior que o papel deixaria a linha sem espaço nenhum para o texto.
  const limite = Math.max(0, largura - 8);
  const recuo = Math.min(limite, Math.max(0, opcoes.recuo ?? 0));
  const recuoInicial = Math.min(limite, Math.max(0, opcoes.recuoInicial ?? recuo));
  const linhas: string[] = [];
  const paragrafos = texto.split("\n");

  for (const paragrafo of paragrafos) {
    const palavras = paragrafo.split(" ").filter((p) => p.length > 0);
    if (palavras.length === 0) {
      // Linha em branco que o cliente deixou de propósito.
      if (linhas.length > 0) linhas.push("");
      continue;
    }
    let atual = "";
    const espacoDaLinha = () => largura - (linhas.length === 0 ? recuoInicial : recuo);

    const fecharLinha = () => {
      const margem = linhas.length === 0 ? recuoInicial : recuo;
      linhas.push(" ".repeat(margem) + atual);
      atual = "";
    };

    for (let palavra of palavras) {
      // Palavra maior que a linha inteira: parte em pedaços.
      while (palavra.length > espacoDaLinha() && espacoDaLinha() > 0) {
        if (atual) fecharLinha();
        const cabe = Math.max(1, espacoDaLinha());
        atual = palavra.slice(0, cabe);
        palavra = palavra.slice(cabe);
        fecharLinha();
      }
      if (!palavra) continue;
      const candidata = atual ? `${atual} ${palavra}` : palavra;
      if (candidata.length <= espacoDaLinha()) {
        atual = candidata;
      } else {
        fecharLinha();
        atual = palavra;
      }
    }
    if (atual) fecharLinha();
  }

  // Tira linhas em branco do final.
  while (linhas.length > 0 && linhas[linhas.length - 1].trim() === "") linhas.pop();
  return linhas;
}

/** Centraliza cada linha (quebrando antes, se for maior que o papel). */
export function centralizar(texto: string, largura: number): string[] {
  return quebrarTexto(texto, largura).map((linha) => {
    const sobra = largura - linha.length;
    return " ".repeat(Math.floor(sobra / 2)) + linha;
  });
}

/** Linha divisória do tamanho exato do papel. */
export function separador(largura: number, simbolo = "-"): string {
  return simbolo.repeat(largura);
}

/**
 * Texto à esquerda e valor à direita na mesma linha — "Subtotal ... R$ 95,00".
 *
 * Se não couber, o texto quebra na própria coluna e o valor fica na primeira
 * linha, encostado à direita. Se nem assim couber (valor enorme num papel
 * estreito), o valor desce para uma linha só dele, ainda à direita.
 * Nunca um invade o outro.
 */
export function esquerdaDireita(
  esquerda: string,
  direita: string,
  largura: number,
  opcoes: { recuo?: number } = {},
): string[] {
  const recuo = opcoes.recuo ?? 0;
  if (!direita) return quebrarTexto(esquerda, largura, { recuo, recuoInicial: 0 });

  const espacoParaTexto = largura - direita.length - 1;
  if (espacoParaTexto >= Math.min(10, Math.floor(largura / 2))) {
    const partes = quebrarTexto(esquerda, espacoParaTexto, { recuo, recuoInicial: 0 });
    if (partes.length === 0) partes.push("");
    const [primeira, ...resto] = partes;
    const linhaComValor =
      primeira + " ".repeat(largura - primeira.length - direita.length) + direita;
    return [linhaComValor, ...resto];
  }

  const partes = quebrarTexto(esquerda, largura, { recuo, recuoInicial: 0 });
  const valor =
    direita.length > largura ? quebrarTexto(direita, largura) : [direita.padStart(largura)];
  return [...partes, ...valor];
}

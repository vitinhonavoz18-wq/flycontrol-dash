/**
 * Qual aba o endereço está pedindo.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POR QUE ISTO EXISTE, EM VEZ DE UMA LINHA SOLTA EM CADA TELA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Este código já quebrou uma vez, e quebrou EM SILÊNCIO.
 *
 * A leitura era feita assim em cada tela:
 *
 *     new URLSearchParams(typeof busca === "string" ? busca : "").get("aba")
 *
 * Só que o `busca` do roteador NÃO é texto: é um objeto já desmontado
 * (`{ aba: "delivery" }`). Então a conta caía sempre no `: ""`, e a resposta
 * era sempre "nenhuma aba" — o endereço dizia `?aba=delivery`, a aba mudava
 * de cor ao ser clicada, e o conteúdo embaixo nunca trocava.
 *
 * O pior não foi o erro: foi o `: ""`. Aquele "se não for texto, usa vazio"
 * parecia cuidado e era mordaça — ele transformou um defeito que teria
 * aparecido na hora num defeito mudo, que só apareceu com o lojista clicando
 * e nada acontecendo.
 *
 * É o fusível trocado por um pedaço de arame: não queima mais, e por isso
 * ninguém descobre que tem curto.
 *
 * Agora existe UM lugar que sabe ler isso, ele aceita as DUAS formas de
 * verdade, e tem teste para as duas.
 */

/** O nome do parâmetro. Uma constante para as telas não divergirem na grafia. */
export const PARAMETRO_DA_ABA = "aba";

/**
 * @param busca  O que o roteador entrega: um objeto (`{ aba: "delivery" }`)
 *               ou o texto cru (`"?aba=delivery"`). As duas servem.
 * @param padrao A aba que abre quando o endereço não pede nenhuma.
 */
export function abaDoEndereco(busca: unknown, padrao: string): string {
  if (typeof busca === "string") {
    const achada = new URLSearchParams(busca).get(PARAMETRO_DA_ABA);
    return achada || padrao;
  }

  if (busca && typeof busca === "object" && !Array.isArray(busca)) {
    const valor = (busca as Record<string, unknown>)[PARAMETRO_DA_ABA];
    if (typeof valor === "string" && valor.trim()) return valor;
  }

  return padrao;
}

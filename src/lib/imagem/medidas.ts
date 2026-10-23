/**
 * Até que tamanho cada tipo de imagem é guardado quando o lojista envia.
 *
 * Foto de produto fica em 900 pontos (ver `image-upload.tsx`): aparece
 * pequena na lista e precisa abrir rápido. Capa e logo aparecem grandes —
 * a capa ocupa a tela inteira do computador — e com 900 ficavam borradas,
 * como ampliar uma foto 3x4 para virar pôster.
 */
/** Capa do cardápio: cobre a tela larga do computador, inclusive retina. */
export const LIMITE_CAPA = 2400;
/** Logo: nítida no tamanho grande da capa, também em tela retina. */
export const LIMITE_LOGO = 1200;

/**
 * As medidas finais da imagem: encolhe proporcionalmente até o maior lado
 * caber no limite. Nunca aumenta — aumentar uma foto pequena só a deixa
 * maior e mais borrada, sem ganhar nitidez nenhuma.
 */
export function medidasFinais(
  largura: number,
  altura: number,
  limite: number,
): { largura: number; altura: number } {
  const escala = Math.min(1, limite / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

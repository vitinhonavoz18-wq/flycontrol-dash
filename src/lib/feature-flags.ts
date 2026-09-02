/**
 * Áreas do painel que ainda estão em desenvolvimento.
 *
 * Enquanto o endereço estiver nesta lista, o item some dos menus (barra
 * lateral no computador e menu "Mais" no celular). É como uma sala do
 * restaurante que ainda está em obra: a porta continua existindo, mas some
 * do mapa que o cliente recebe na entrada — ninguém entra sem querer.
 *
 * Para liberar uma área, basta apagar a linha correspondente daqui.
 */
export const ROTAS_EM_DESENVOLVIMENTO: readonly string[] = [
  "/flydelivery",
  "/marketing",
  "/billing",
];

export function emDesenvolvimento(to: string): boolean {
  return ROTAS_EM_DESENVOLVIMENTO.includes(to);
}

/**
 * Ler o que o lojista digitou no campo de taxa de entrega.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * O ERRO QUE ISTO CONSERTA — COBROU R$ 500 DE ENTREGA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A regra antiga apagava TODO ponto antes de converter, porque em português o
 * ponto separa milhar ("1.500,00"). Só que ninguém digita mil e quinhentos
 * reais de entrega — digita cinco reais. E quem digitava "5.00" (com ponto,
 * como no teclado do celular) via o sistema entender QUINHENTOS.
 *
 * Foi exatamente o que aconteceu com a Lancheterapia: o bairro "Sete" ficou
 * com taxa de R$ 500,00 no cardápio.
 *
 * É a balança do açougue lendo 5,00 kg como 500 kg: o número está lá, mas a
 * vírgula foi parar no lugar errado e o cliente leva o susto no caixa.
 *
 * A REGRA NOVA
 *
 * Quem manda é a VÍRGULA, porque ela é o separador decimal daqui:
 *
 *   • tem vírgula  → os pontos são separadores de milhar ("1.500,00" = 1500)
 *   • sem vírgula, um ponto só → o ponto é a vírgula ("5.00" = 5,00)
 *   • sem vírgula, vários pontos → aí sim são milhares ("1.500" = 1500)
 *
 * Na dúvida entre R$ 5,00 e R$ 500,00 de entrega, a escolha certa é a que não
 * assusta o cliente.
 */
export function lerTaxa(texto: string): number | null {
  const bruto = texto.trim();
  if (bruto === "") return null;

  let normalizado: string;

  if (bruto.includes(",")) {
    // A vírgula decide: o que vier de ponto é separador de milhar.
    normalizado = bruto.replace(/\./g, "").replace(",", ".");
  } else {
    const pontos = (bruto.match(/\./g) ?? []).length;
    // Um ponto só, sem vírgula nenhuma: é o teclado do celular escrevendo a
    // vírgula com ponto. "5.00" é cinco reais, não quinhentos.
    normalizado = pontos === 1 ? bruto : bruto.replace(/\./g, "");
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Como a taxa aparece no campo: sempre com vírgula, como o lojista escreve. */
export function formatarTaxa(fee: number): string {
  return fee.toFixed(2).replace(".", ",");
}

/**
 * Um valor de entrega alto o bastante para ser provavelmente um engano.
 *
 * Não é uma trava — a tela só pergunta "tem certeza?". Loja que entrega em
 * outra cidade pode cobrar R$ 80 de verdade, e não cabe ao sistema decidir o
 * preço de ninguém. Mas R$ 500 de entrega nunca é de propósito, e uma
 * pergunta a mais é mais barata que um cliente perdido.
 */
export const TAXA_SUSPEITA = 100;

export function pareceEngano(fee: number): boolean {
  return fee >= TAXA_SUSPEITA;
}

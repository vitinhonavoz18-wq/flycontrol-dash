/**
 * Como quantidade e dinheiro aparecem na tela do módulo de estoque.
 *
 * Um lugar só: se um dia a loja passar a controlar em gramas e a tela mostrar
 * "1250" onde deveria ler "1,25 kg", o conserto é aqui e vale para todas as
 * telas de uma vez.
 */

/**
 * Quantidade sem casas decimais à toa.
 *
 * O banco guarda com três casas porque Kg e Litro precisam (1,250 kg de carne
 * é uma quantidade legítima). Mas mostrar "12,000 unidades" de Coca-Cola
 * parece defeito. Então as casas só aparecem quando dizem alguma coisa.
 */
export function qtd(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

/** Lê "5,50" e "5.50" — o lojista digita como quiser, sem ficar corrigindo. */
export function lerNumero(texto: string): number | null {
  const limpo = String(texto ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "") // 1.250 → 1250 (ponto de milhar)
    .replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Reais digitados viram centavos inteiros. "12,50" → 1250. */
export function paraCentavos(texto: string): number | null {
  const n = lerNumero(texto);
  if (n === null || n < 0) return null;
  return Math.round(n * 100);
}

/** Centavos inteiros viram o que se digita num campo. 1250 → "12,50". */
export function deCentavos(centavos: number | null | undefined): string {
  return ((Number(centavos) || 0) / 100).toFixed(2).replace(".", ",");
}

/**
 * A margem de lucro, em porcentagem sobre o preço de venda.
 *
 * Custo R$ 5,00 e venda R$ 8,00 dão lucro de R$ 3,00 e margem de 37,50% —
 * porque a conta é sobre o que entra no caixa, não sobre o que se pagou. É a
 * pergunta "de cada R$ 100 que eu vendo, quanto sobra?".
 *
 * Venda zero devolve nulo em vez de dividir por zero: produto sem preço ainda
 * não tem margem, e mostrar "0%" ou "infinito" seria inventar resposta.
 */
export function margemPercentual(custoCents: number, vendaCents: number): number | null {
  if (!vendaCents || vendaCents <= 0) return null;
  return ((vendaCents - custoCents) / vendaCents) * 100;
}

export function formatarPercentual(p: number | null): string {
  if (p === null) return "—";
  return `${p.toFixed(2).replace(".", ",")}%`;
}

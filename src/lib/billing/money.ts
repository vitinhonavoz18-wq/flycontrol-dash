/**
 * Dinheiro na FlyControl é sempre um inteiro em centavos.
 *
 * Ponto flutuante não representa exatamente valores decimais: `0.1 + 0.2` dá
 * `0.30000000000000004`, e 500 × 0.70 dá 349.99999999999994. Em um sistema de
 * cobrança isso vira centavo faltando na fatura. Todo cálculo acontece em
 * inteiros; a formatação só entra na hora de mostrar na tela.
 */

/** Centavos. O tipo é `number`, mas o contrato é "inteiro, nunca fracionário". */
export type Cents = number;

export function isValidCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Garante que um valor vindo do banco ou de um payload é utilizável como
 * dinheiro. Falha alto: um centavo silenciosamente errado é pior que um erro.
 */
export function assertCents(value: unknown, field: string): Cents {
  if (!isValidCents(value)) {
    throw new Error(
      `[billing] ${field} precisa ser um inteiro em centavos, recebido: ${String(value)}`,
    );
  }
  return value;
}

/**
 * Multiplica um preço unitário por uma quantidade inteira.
 * Ambos são inteiros, então o produto é exato — não há arredondamento.
 */
export function multiplyCents(unitPriceCents: Cents, quantity: number): Cents {
  assertCents(unitPriceCents, "unitPriceCents");
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(
      `[billing] quantidade precisa ser um inteiro não negativo, recebido: ${String(quantity)}`,
    );
  }
  return unitPriceCents * quantity;
}

export function sumCents(...values: Cents[]): Cents {
  return values.reduce<Cents>((total, value, index) => {
    assertCents(value, `parcela[${index}]`);
    return total + value;
  }, 0);
}

/** "R$ 375,00". Formatação é apresentação — nunca entra em cálculo. */
export function formatCents(value: Cents): string {
  assertCents(value, "value");
  const negative = value < 0;
  const absolute = Math.abs(value);
  const reais = Math.floor(absolute / 100);
  const cents = absolute % 100;
  const formatted = `R$ ${reais.toLocaleString("pt-BR")},${String(cents).padStart(2, "0")}`;
  return negative ? `- ${formatted}` : formatted;
}

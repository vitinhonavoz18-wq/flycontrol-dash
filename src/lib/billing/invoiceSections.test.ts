import { describe, expect, it } from "vitest";
import { separarItensDaFatura } from "./invoiceSections";

const plano = {
  itemType: "monthly_fee",
  description: "Plano FlyControl",
  quantity: 1,
  totalCents: 13990,
};
const impulso = (nome: string, cents: number) => ({
  itemType: "addon",
  description: `Impulsionamento — ${nome}`,
  quantity: 1,
  totalCents: cents,
});

describe("separarItensDaFatura", () => {
  it("plano + impulsionamentos: cada um na sua parte, total = soma", () => {
    const s = separarItensDaFatura(
      [plano, impulso("A — 7 dias", 6000), impulso("B — 3 dias", 2500)],
      22490,
    );
    expect(s.assinatura).toHaveLength(1);
    expect(s.adicionais).toHaveLength(2);
    expect(s.assinaturaCents).toBe(13990);
    expect(s.adicionaisCents).toBe(8500);
    expect(s.assinaturaCents + s.adicionaisCents).toBe(s.totalCents);
  });

  it("sem impulsionamento, a fatura fica como sempre foi", () => {
    const s = separarItensDaFatura([plano], 13990);
    expect(s.adicionais).toHaveLength(0);
    expect(s.adicionaisCents).toBe(0);
    expect(s.assinaturaCents).toBe(13990);
  });

  it("pedidos e desconto contam como assinatura", () => {
    const s = separarItensDaFatura(
      [
        { itemType: "usage", description: "Pedidos", quantity: 100, totalCents: 4500 },
        { itemType: "discount", description: "Desconto", quantity: 1, totalCents: -500 },
        impulso("C — 1 dia", 1000),
      ],
      5000,
    );
    expect(s.assinaturaCents).toBe(4000);
    expect(s.adicionaisCents).toBe(1000);
  });

  it("fatura antiga sem itens mostra o total como plano", () => {
    const s = separarItensDaFatura([], 13990);
    expect(s.assinatura).toEqual([
      { itemType: "monthly_fee", description: "Plano FlyControl", quantity: 1, totalCents: 13990 },
    ]);
    expect(s.adicionais).toHaveLength(0);
  });
});

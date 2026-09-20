import { describe, expect, it } from "vitest";
import { formatarTaxa, lerTaxa, pareceEngano } from "./taxaDeEntrega";

describe("o erro que cobrou R$ 500 de entrega", () => {
  it('"5.00" é cinco reais, não quinhentos', () => {
    // Este é O teste. A regra antiga apagava todo ponto antes de converter, e
    // "5.00" virava 500. Aconteceu de verdade: o bairro "Sete" da
    // Lancheterapia ficou com R$ 500,00 de taxa no cardápio.
    expect(lerTaxa("5.00")).toBe(5);
  });

  it('"7.50" é sete e cinquenta', () => {
    expect(lerTaxa("7.50")).toBe(7.5);
  });

  it('"10.00" é dez reais', () => {
    expect(lerTaxa("10.00")).toBe(10);
  });
});

describe("o jeito que cada um digita", () => {
  it("aceita vírgula, que é como se escreve em português", () => {
    expect(lerTaxa("5,00")).toBe(5);
    expect(lerTaxa("5,50")).toBe(5.5);
    expect(lerTaxa("12,90")).toBe(12.9);
  });

  it("aceita número inteiro, sem casas", () => {
    expect(lerTaxa("8")).toBe(8);
    expect(lerTaxa("0")).toBe(0);
  });

  it("aceita espaço sobrando", () => {
    expect(lerTaxa("  6,50  ")).toBe(6.5);
  });

  it("aceita quem começa pela vírgula", () => {
    expect(lerTaxa(",50")).toBe(0.5);
  });

  it("com vírgula, o ponto volta a ser milhar", () => {
    // Aqui não há ambiguidade: quem escreveu a vírgula já disse onde ficam os
    // centavos, então o ponto só pode ser separador de milhar.
    expect(lerTaxa("1.500,00")).toBe(1500);
    expect(lerTaxa("1.234.567,89")).toBe(1234567.89);
  });

  it("vários pontos sem vírgula também são milhar", () => {
    expect(lerTaxa("1.500.000")).toBe(1500000);
  });

  it("arredonda para centavos inteiros", () => {
    expect(lerTaxa("5,555")).toBe(5.56);
  });
});

describe("o que não pode passar", () => {
  it("campo vazio não vira zero por acidente", () => {
    // Zero é um preço válido (entrega grátis). Deixar o vazio virar zero faria
    // o lojista publicar frete grátis sem ter pedido isso.
    expect(lerTaxa("")).toBeNull();
    expect(lerTaxa("   ")).toBeNull();
  });

  it("texto não vira número", () => {
    expect(lerTaxa("cinco")).toBeNull();
    expect(lerTaxa("R$ 5,00")).toBeNull();
  });

  it("taxa negativa é recusada", () => {
    expect(lerTaxa("-5")).toBeNull();
  });
});

describe("mostrar de volta para o lojista", () => {
  it("sempre com vírgula e duas casas", () => {
    expect(formatarTaxa(5)).toBe("5,00");
    expect(formatarTaxa(7.5)).toBe("7,50");
    expect(formatarTaxa(0)).toBe("0,00");
  });

  it("o que foi lido volta igual ao ser mostrado", () => {
    // Ida e volta sem perder nada: o lojista digita, salva, reabre e vê o
    // mesmo número. Um centavo perdido aqui vira reclamação no caixa.
    for (const digitado of ["5.00", "5,00", "12,90", "0", "7.5"]) {
      const lido = lerTaxa(digitado)!;
      expect(lerTaxa(formatarTaxa(lido))).toBe(lido);
    }
  });
});

describe("o aviso de valor suspeito", () => {
  it("R$ 500 de entrega acende o alerta", () => {
    expect(pareceEngano(500)).toBe(true);
  });

  it("taxa normal de bairro passa sem perguntar nada", () => {
    // Perguntar "tem certeza?" a cada R$ 5,00 treina o lojista a clicar em
    // "sim" sem ler — e aí o aviso não serve para mais nada.
    expect(pareceEngano(5)).toBe(false);
    expect(pareceEngano(15)).toBe(false);
    expect(pareceEngano(80)).toBe(false);
  });
});

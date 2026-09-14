import { describe, expect, it } from "vitest";
import {
  deCentavos,
  formatarPercentual,
  lerNumero,
  margemPercentual,
  paraCentavos,
  qtd,
} from "./formato";

describe("quantidade na tela", () => {
  it("número inteiro aparece sem casas decimais", () => {
    // "12,000 unidades" de Coca-Cola parece defeito de sistema.
    expect(qtd(12)).toBe("12");
    expect(qtd(0)).toBe("0");
  });

  it("quantidade quebrada mantém só as casas que dizem algo", () => {
    expect(qtd(1.25)).toBe("1,25");
    expect(qtd(1.2)).toBe("1,2");
    expect(qtd(0.5)).toBe("0,5");
  });

  it("kg com três casas aparece inteiro", () => {
    expect(qtd(1.255)).toBe("1,255");
  });

  it("valor vazio ou inválido vira zero, e não 'NaN' na tela", () => {
    expect(qtd(null)).toBe("0");
    expect(qtd(undefined)).toBe("0");
    expect(qtd("abc")).toBe("0");
  });

  it("saldo negativo aparece com o sinal", () => {
    // Loja que vende a descoberto pode ficar negativa; esconder o sinal faria
    // "-83" virar "83" e o dono acharia que tem mercadoria.
    expect(qtd(-83)).toBe("-83");
  });
});

describe("o lojista digita como quiser", () => {
  it("aceita vírgula, que é como se escreve preço no Brasil", () => {
    expect(lerNumero("5,50")).toBe(5.5);
  });

  it("aceita ponto também, para quem está acostumado com o teclado numérico", () => {
    expect(lerNumero("5.50")).toBe(5.5);
  });

  it("entende ponto de milhar", () => {
    // "1.250" num campo de quantidade é mil duzentos e cinquenta, não um e
    // pouco — é assim que se escreve em português.
    expect(lerNumero("1.250")).toBe(1250);
  });

  it("ignora espaços digitados sem querer", () => {
    expect(lerNumero(" 12 ")).toBe(12);
  });

  it("campo vazio não vira zero — vira 'não informado'", () => {
    // A diferença importa: zero é uma resposta, vazio é a falta dela. Tratar
    // vazio como zero faria uma entrada em branco virar movimentação de zero.
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("   ")).toBeNull();
  });

  it("texto que não é número devolve nulo", () => {
    expect(lerNumero("dez caixas")).toBeNull();
  });
});

describe("dinheiro em centavos inteiros", () => {
  it("reais digitados viram centavos", () => {
    expect(paraCentavos("12,50")).toBe(1250);
    expect(paraCentavos("8")).toBe(800);
    expect(paraCentavos("0,05")).toBe(5);
  });

  it("centavos voltam para o campo do jeito que se digita", () => {
    expect(deCentavos(1250)).toBe("12,50");
    expect(deCentavos(0)).toBe("0,00");
    expect(deCentavos(5)).toBe("0,05");
  });

  it("ida e volta não perde centavo", () => {
    // O erro clássico de dinheiro em decimal: 0,07 + 0,07 dando 0,14000000001.
    // Guardando em centavos inteiros isso não acontece.
    for (const v of ["0,01", "0,07", "12,34", "999,99", "1.234,56"]) {
      expect(deCentavos(paraCentavos(v)!)).toBe(v.replace(/\./g, ""));
    }
  });

  it("valor negativo é recusado", () => {
    expect(paraCentavos("-5")).toBeNull();
  });
});

describe("margem de lucro", () => {
  it("custo 5 e venda 8 dão 37,50% — a conta é sobre o que entra no caixa", () => {
    // De cada R$ 100 vendidos, sobram R$ 37,50. É a pergunta que o dono faz.
    expect(margemPercentual(500, 800)).toBeCloseTo(37.5, 2);
    expect(formatarPercentual(margemPercentual(500, 800))).toBe("37,50%");
  });

  it("vender pelo custo dá margem zero", () => {
    expect(margemPercentual(800, 800)).toBe(0);
  });

  it("vender abaixo do custo dá margem negativa, e isso precisa aparecer", () => {
    expect(margemPercentual(1000, 800)).toBeLessThan(0);
  });

  it("produto sem preço de venda não tem margem — e não quebra a tela", () => {
    // Dividir por zero daria "Infinity" ou "NaN" no lugar do número.
    expect(margemPercentual(500, 0)).toBeNull();
    expect(formatarPercentual(null)).toBe("—");
  });
});

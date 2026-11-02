import { describe, expect, it } from "vitest";
import {
  centralizar,
  esquerdaDireita,
  limparTexto,
  quebrarTexto,
  removerAcentos,
  separador,
} from "./texto";

describe("limpar o texto antes de ir para o papel", () => {
  it("padroniza as três formas de quebra de linha", () => {
    // Windows manda \r\n, Mac antigo \r, celular \n. Um \r sozinho, numa
    // térmica, volta o carro para o começo da MESMA linha e imprime por cima.
    expect(limparTexto("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("tira emoji e troca símbolos que a impressora não tem", () => {
    expect(limparTexto("Pizza 🍕 “especial” • borda – fina…")).toBe(
      'Pizza "especial" - borda - fina...',
    );
  });

  it("junta acento solto à letra (o mesmo 'ã' digitado de dois jeitos)", () => {
    // Alguns celulares mandam "a" + "~" separados: na grade seriam duas
    // casas, e a linha ficaria uma letra mais curta do que parece.
    const decomposto = "Joa" + String.fromCharCode(0x0303) + "o";
    expect(decomposto).toHaveLength(5);
    expect(limparTexto(decomposto)).toBe("Jo\u00e3o");
    expect(limparTexto(decomposto)).toHaveLength(4);
  });

  it("vazio, nulo e indefinido viram texto vazio", () => {
    expect(limparTexto(null)).toBe("");
    expect(limparTexto(undefined)).toBe("");
    expect(limparTexto("   ")).toBe("");
  });

  it("remove acentos para impressora 'Somente texto'", () => {
    expect(removerAcentos("Observação: pão, maçã, nº 2ª, 25°")).toBe(
      "Observacao: pao, maca, no 2a, 25o",
    );
  });
});

describe("quebrar o texto na largura do papel", () => {
  it("nenhuma linha passa da largura", () => {
    const longo =
      "Pizza meio a meio de calabresa acebolada com borda recheada de catupiry e muito orégano por cima";
    for (const largura of [24, 32, 42, 48]) {
      for (const l of quebrarTexto(longo, largura)) expect(l.length).toBeLessThanOrEqual(largura);
    }
  });

  it("não corta palavra no meio quando ela cabe", () => {
    expect(quebrarTexto("sem cebola bem passada", 12)).toEqual(["sem cebola", "bem passada"]);
  });

  it("parte palavra que sozinha não cabe na linha", () => {
    const linhas = quebrarTexto("codigo:ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);
    expect(linhas.every((l) => l.length <= 10)).toBe(true);
    expect(linhas.join("")).toBe("codigo:ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it("respeita as quebras que o cliente digitou", () => {
    expect(quebrarTexto("sem cebola\nbem passada", 32)).toEqual(["sem cebola", "bem passada"]);
  });

  it("recuo alinha as linhas seguintes", () => {
    expect(quebrarTexto("um dois tres quatro", 15, { recuo: 3, recuoInicial: 3 })).toEqual([
      "   um dois tres",
      "   quatro",
    ]);
  });

  it("recuo maior que o papel não trava nem estoura a largura", () => {
    const linhas = quebrarTexto("texto qualquer aqui", 24, { recuo: 50 });
    expect(linhas.every((l) => l.length <= 24)).toBe(true);
  });
});

describe("alinhar", () => {
  it("separador tem exatamente a largura do papel", () => {
    expect(separador(32)).toHaveLength(32);
    expect(separador(48, "=")).toBe("=".repeat(48));
  });

  it("centraliza dentro da largura", () => {
    expect(centralizar("ABC", 9)).toEqual(["   ABC"]);
  });

  it("valor monetário encosta na direita", () => {
    const [linha] = esquerdaDireita("Subtotal:", "R$ 95,00", 32);
    expect(linha).toHaveLength(32);
    expect(linha.endsWith("R$ 95,00")).toBe(true);
    expect(linha.startsWith("Subtotal:")).toBe(true);
  });

  it("texto longo quebra sem invadir a coluna do valor", () => {
    const linhas = esquerdaDireita("2x PIZZA GIGANTE DE CALABRESA ACEBOLADA", "R$ 189,90", 32);
    expect(linhas[0].endsWith("R$ 189,90")).toBe(true);
    // O texto da primeira linha termina antes do valor, com espaço entre eles.
    expect(linhas[0].slice(0, 32 - "R$ 189,90".length)).toMatch(/ $/);
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(32);
    expect(linhas.slice(1).every((l) => !l.includes("R$"))).toBe(true);
  });

  it("valor enorme em papel estreito desce para uma linha só dele", () => {
    const linhas = esquerdaDireita("Total geral do pedido", "R$ 1.234.567,89", 24);
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(24);
    expect(linhas[linhas.length - 1].trim()).toBe("R$ 1.234.567,89");
  });
});

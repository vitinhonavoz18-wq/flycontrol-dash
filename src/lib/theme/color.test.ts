import { describe, expect, it } from "vitest";
import {
  COR_DE_FABRICA,
  corEscolhida,
  clarear,
  escurecer,
  formatar,
  lerCor,
  paraHex,
  paraHslTexto,
  paraRgbTexto,
  paraTripletoHsl,
  textoLegivelSobre,
  variacoes,
} from "./color";

describe("leitura de códigos de cor", () => {
  it("entende hex de 6 dígitos, com e sem cerquilha", () => {
    expect(paraHex(lerCor("#D7AC32")!)).toBe("#D7AC32");
    expect(paraHex(lerCor("D7AC32")!)).toBe("#D7AC32");
    expect(paraHex(lerCor("  #d7ac32  ")!)).toBe("#D7AC32");
  });

  it("entende o atalho de 3 dígitos", () => {
    expect(paraHex(lerCor("#f00")!)).toBe("#FF0000");
    expect(paraHex(lerCor("#abc")!)).toBe("#AABBCC");
  });

  it("descarta a transparência do hex de 8 dígitos", () => {
    // A marca é opaca: metade de um logo transparente no cardápio seria pior
    // do que a cor cheia.
    expect(paraHex(lerCor("#D7AC3280")!)).toBe("#D7AC32");
  });

  it("entende rgb() e hsl()", () => {
    expect(paraHex(lerCor("rgb(215, 172, 50)")!)).toBe("#D7AC32");
    expect(paraHex(lerCor("hsl(45, 68%, 52%)")!)).toBe(paraHex(lerCor("hsl(45 68% 52%)")!));
  });

  it("entende a receita solta usada pelo site", () => {
    const cor = lerCor("38 92% 50%")!;
    expect(cor).toEqual({ h: 38, s: 92, l: 50 });
    expect(lerCor("38, 92%, 50%")).toEqual(cor);
  });

  it("recusa o que não é cor", () => {
    // É o porteiro conferindo a lista: sem isso, "azul do logo" iria parar no
    // banco e o cardápio ficaria sem cor nenhuma.
    for (const lixo of ["", "   ", "azul", "#12345", "#GGGGGG", "rgb(300, 0, 0)", null, 42, {}]) {
      expect(lerCor(lixo)).toBeNull();
    }
  });
});

describe("ida e volta entre formatos", () => {
  it("volta ao mesmo hex depois de virar receita do site", () => {
    // Se esta conta perdesse precisão, a cor gravada não seria a escolhida:
    // o lojista digitaria #101010 e o site pintaria outro tom.
    const amostras = [
      "#101010",
      "#D7AC32",
      "#FF5A00",
      "#000000",
      "#FFFFFF",
      "#1A2B3C",
      "#7F00FF",
      "#00FF95",
    ];
    for (const hex of amostras) {
      const cor = lerCor(hex)!;
      const guardado = paraTripletoHsl(cor);
      expect(paraHex(lerCor(guardado)!)).toBe(hex.toUpperCase());
    }
  });

  it("sobrevive à ida e volta em qualquer cor", () => {
    for (let i = 0; i < 400; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const hex =
        `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      const guardado = paraTripletoHsl(lerCor(hex)!);
      expect(paraHex(lerCor(guardado)!)).toBe(hex);
    }
  });

  it("escreve cada formato do jeito que o CSS espera", () => {
    const cor = lerCor("#D7AC32")!;
    expect(formatar(cor, "hex")).toBe("#D7AC32");
    expect(paraRgbTexto(cor)).toBe("rgb(215, 172, 50)");
    expect(paraHslTexto(cor)).toMatch(/^hsl\(\d+(\.\d+)?, \d+(\.\d+)?%, \d+(\.\d+)?%\)$/);
    expect(paraTripletoHsl(cor)).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
  });
});

describe("variações", () => {
  it("clareia e escurece sem sair do intervalo", () => {
    const cor = lerCor("#D7AC32")!;
    expect(clarear(cor, 1).l).toBe(100);
    expect(escurecer(cor, 1).l).toBe(0);
  });

  it("entrega cinco tons, do mais claro ao mais escuro", () => {
    const tons = variacoes(lerCor("#D7AC32")!);
    expect(tons).toHaveLength(5);
    const luminosidades = tons.map((t) => t.cor.l);
    for (let i = 1; i < luminosidades.length; i++) {
      expect(luminosidades[i]).toBeLessThan(luminosidades[i - 1]);
    }
  });

  it("mantém o preto e o branco onde estão", () => {
    expect(clarear({ h: 0, s: 0, l: 100 }, 0.5).l).toBe(100);
    expect(escurecer({ h: 0, s: 0, l: 0 }, 0.5).l).toBe(0);
  });
});

describe("texto legível por cima da cor", () => {
  it("põe letra preta sobre cor clara e branca sobre cor escura", () => {
    expect(textoLegivelSobre(lerCor("#FFD500")!).l).toBe(0);
    expect(textoLegivelSobre(lerCor("#101010")!).l).toBe(100);
    expect(textoLegivelSobre(lerCor("#E50914")!).l).toBe(100);
  });
});

describe("o que conta como cor escolhida pela loja", () => {
  it("ignora vazio e o valor de fábrica", () => {
    // Ninguém escolheu #FF7A00: é o que a tabela preenche sozinha. Contar
    // como escolha faria toda loja antiga mudar de cara sem pedir.
    expect(corEscolhida(null)).toBeNull();
    expect(corEscolhida("")).toBeNull();
    expect(corEscolhida("   ")).toBeNull();
    expect(corEscolhida(COR_DE_FABRICA)).toBeNull();
    expect(corEscolhida("#ff7a00")).toBeNull();
  });

  it("aceita o que a loja realmente escolheu, em qualquer formato", () => {
    expect(paraHex(corEscolhida("#101010")!)).toBe("#101010");
    expect(paraHex(corEscolhida("38 92% 50%")!)).toBe(paraHex(lerCor("38 92% 50%")!));
  });

  it("ignora código inválido em vez de inventar uma cor", () => {
    expect(corEscolhida("azul")).toBeNull();
  });
});

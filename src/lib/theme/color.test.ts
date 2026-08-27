import { describe, expect, it } from "vitest";
import {
  COR_DE_FABRICA,
  apagadoSobre,
  bordaSobre,
  corEscolhida,
  clarear,
  ehEscuro,
  escurecer,
  formatar,
  lerCor,
  paraHex,
  paraHslTexto,
  paraRgbTexto,
  paraTripletoHsl,
  razaoDeContraste,
  superficieSobre,
  textoApagadoSobre,
  textoLegivelSobre,
  textoPrincipalSobre,
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

describe("peças derivadas do fundo escolhido", () => {
  const FUNDOS = ["#101010", "#F4F1EA", "#14213D", "#FFFFFF", "#000000", "#2E1A47", "#FAFAFA"];

  it("o texto principal sempre passa no critério mais exigente de contraste", () => {
    // 7:1 é o nível AAA do WCAG. Abaixo de 4,5 alguém com a vista cansada,
    // ou com o celular no sol, simplesmente não lê a descrição do prato.
    for (const hex of FUNDOS) {
      const fundo = lerCor(hex)!;
      const contraste = razaoDeContraste(textoPrincipalSobre(fundo), fundo);
      expect(contraste, `texto principal sobre ${hex}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("o texto de apoio ainda passa no mínimo para texto corrido", () => {
    for (const hex of FUNDOS) {
      const fundo = lerCor(hex)!;
      const contraste = razaoDeContraste(textoApagadoSobre(fundo), fundo);
      expect(contraste, `texto de apoio sobre ${hex}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o card nunca sai da mesma cor do fundo", () => {
    // Sem isto, um fundo preto teria card preto: os produtos sumiriam, como
    // um prato branco servido sobre uma toalha branca.
    for (const hex of FUNDOS) {
      const fundo = lerCor(hex)!;
      expect(paraTripletoHsl(superficieSobre(fundo))).not.toBe(paraTripletoHsl(fundo));
      expect(paraTripletoHsl(bordaSobre(fundo))).not.toBe(paraTripletoHsl(fundo));
    }
  });

  it("clareia sobre fundo escuro e escurece sobre fundo claro", () => {
    const escuro = lerCor("#101010")!;
    expect(superficieSobre(escuro).l).toBeGreaterThan(escuro.l);
    expect(bordaSobre(escuro).l).toBeGreaterThan(escuro.l);

    const branco = lerCor("#FFFFFF")!;
    expect(superficieSobre(branco).l).toBeLessThan(branco.l);
    expect(bordaSobre(branco).l).toBeLessThan(branco.l);
  });

  // ESTES NÚMEROS SÃO O CONTRATO ENTRE OS DOIS SISTEMAS.
  //
  // O site público (conectfly, lib/site/brandColor.ts) calcula as mesmas
  // peças com as mesmas contas, e tem um teste idêntico a este. Se um lado
  // mudar e o outro não, a prévia passa a prometer uma coisa e o cardápio a
  // entregar outra — e o teste que quebra é este.
  it("bate exatamente com a conta que o site público usa", () => {
    const preto = lerCor("#101010")!;
    expect(paraTripletoHsl(preto)).toBe("0 0% 6.27%");
    expect(paraTripletoHsl(superficieSobre(preto))).toBe("0 0% 11.27%");
    expect(paraTripletoHsl(apagadoSobre(preto))).toBe("0 0% 14.27%");
    expect(paraTripletoHsl(bordaSobre(preto))).toBe("0 0% 22.27%");
    expect(paraTripletoHsl(textoPrincipalSobre(preto))).toBe("0 0% 98%");
    expect(paraTripletoHsl(textoApagadoSobre(preto))).toBe("0 0% 68%");

    const claro = lerCor("#F4F1EA")!;
    expect(paraTripletoHsl(textoPrincipalSobre(claro))).toBe("222 47% 11%");
    expect(ehEscuro(claro)).toBe(false);
  });

  it("reconhece fundo escuro e fundo claro", () => {
    expect(ehEscuro(lerCor("#101010")!)).toBe(true);
    expect(ehEscuro(lerCor("#14213D")!)).toBe(true);
    expect(ehEscuro(lerCor("#F4F1EA")!)).toBe(false);
    expect(ehEscuro(lerCor("#FFFFFF")!)).toBe(false);
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

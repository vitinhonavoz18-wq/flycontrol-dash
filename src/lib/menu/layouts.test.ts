import { describe, expect, it } from "vitest";
import { LAYOUTS, layoutPorId, layoutRecomendadoPara, type LayoutId } from "./layouts";

// ESTA LISTA É O CONTRATO ENTRE OS DOIS SISTEMAS.
//
// O SiteCreatorFly monta o cardápio a partir do identificador que o painel
// grava. Se um lado ganhar um layout e o outro não, o lojista escolhe algo
// que o cardápio não sabe montar — e cai no padrão sem explicação. O teste
// espelho vive em `src/lib/site/menuLayout.test.ts` no outro projeto.
const IDS_ESPERADOS: LayoutId[] = [
  "generic",
  "pizza",
  "burger",
  "acai",
  "restaurant",
  "japanese",
  "bakery",
  "beverage",
  "pharmacy",
  "market",
];

describe("catálogo de layouts", () => {
  it("tem exatamente os mesmos identificadores do site público", () => {
    expect(LAYOUTS.map((l) => l.id).sort()).toEqual([...IDS_ESPERADOS].sort());
  });

  it("não repete identificador", () => {
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
  });

  it("todo layout tem nome e descrição para a tela", () => {
    for (const l of LAYOUTS) {
      expect(l.nome.trim().length, l.id).toBeGreaterThan(0);
      expect(l.descricao.trim().length, l.id).toBeGreaterThan(0);
    }
  });

  it("todo layout monta o cardápio de produtos", () => {
    for (const l of LAYOUTS) expect(l.ordem, l.id).toContain("cardapio");
  });

  it("acha layout pelo id e recusa o que não existe", () => {
    expect(layoutPorId("pizza")?.nome).toBe("Pizzaria");
    expect(layoutPorId("pizza_premium")).toBeNull();
    expect(layoutPorId(null)).toBeNull();
  });
});

describe("recomendação a partir do tipo de estabelecimento", () => {
  it("cobre todos os tipos que a tela Minha Loja oferece", () => {
    // Se um tipo do formulário não tivesse recomendação, o lojista veria
    // "Padrão" sem entender por quê.
    const doFormulario: Array<[string, LayoutId]> = [
      ["Pizzaria", "pizza"],
      ["Pastelaria", "burger"],
      ["Hamburgueria", "burger"],
      ["Restaurante", "restaurant"],
      ["Lanchonete", "burger"],
      ["Açaíteria", "acai"],
      ["Farmácia", "pharmacy"],
      ["Mercado", "market"],
      ["Outro", "generic"],
    ];
    for (const [tipo, esperado] of doFormulario) {
      expect(layoutRecomendadoPara(tipo), tipo).toBe(esperado);
    }
  });

  it("não se perde com acento nem com caixa", () => {
    expect(layoutRecomendadoPara("açaíteria")).toBe("acai");
    expect(layoutRecomendadoPara("FARMÁCIA")).toBe("pharmacy");
  });

  it("reconhece dentro de um nome composto", () => {
    expect(layoutRecomendadoPara("Distribuidora de bebidas")).toBe("beverage");
  });

  it("não confunde palavra curta dentro de outra", () => {
    expect(layoutRecomendadoPara("Barbearia do João")).toBeNull();
  });

  it("devolve nulo quando não reconhece", () => {
    for (const v of ["", "  ", "Loja de tintas", null, undefined, 7]) {
      expect(layoutRecomendadoPara(v)).toBeNull();
    }
  });
});

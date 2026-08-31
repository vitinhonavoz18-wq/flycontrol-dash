import { describe, expect, it } from "vitest";
import {
  CHAVE_DO_MODO,
  COMBOS_INFO,
  deveMostrarCombos,
  ehModoDeNavegacao,
  lojistaEscolheuModo,
  MODO_PADRAO_GLOBAL,
  MODOS_DE_NAVEGACAO,
  MODOS_INFO,
  normalizarModoDeNavegacao,
  normalizarVisibilidadeDeCombos,
  resolverModoDeNavegacao,
  sanearConfiguracoesRecebidas,
  VISIBILIDADES_DE_COMBOS,
  visibilidadeDeCombosDe,
} from "./menuBehavior";
import { LAYOUTS } from "@/lib/menu/layouts";

// ESTES IDENTIFICADORES SÃO O CONTRATO ENTRE OS DOIS SISTEMAS.
//
// O painel grava a string; o cardápio lê a string. Se um lado renomear
// "navigation" e o outro não, o lojista escolhe uma coisa e vê outra — que é
// exatamente o defeito que este módulo veio corrigir. Mudar esta lista sem
// mudar a lista do FlyControl quebra a comunicação entre os dois.
describe("o contrato dos modos de navegação", () => {
  it("tem exatamente os três modos, com estes nomes", () => {
    expect([...MODOS_DE_NAVEGACAO]).toEqual(["navigation", "direct", "cards"]);
  });

  it("guarda a escolha na chave que o FlyControl grava", () => {
    expect(CHAVE_DO_MODO).toBe("entry_mode");
  });

  it("tem rótulo e descrição para todo modo", () => {
    for (const modo of MODOS_DE_NAVEGACAO) {
      expect(MODOS_INFO[modo].rotulo.length).toBeGreaterThan(0);
      expect(MODOS_INFO[modo].descricao.length).toBeGreaterThan(0);
    }
  });

  it("reconhece os três e recusa qualquer outra coisa", () => {
    for (const modo of MODOS_DE_NAVEGACAO) expect(ehModoDeNavegacao(modo)).toBe(true);
    for (const lixo of ["categories", "category_cards", "single_scroll", "", null, 7, {}]) {
      expect(ehModoDeNavegacao(lixo)).toBe(false);
    }
  });
});

describe("normalizar o que veio do banco", () => {
  it("aceita espaço em volta e caixa alta", () => {
    expect(normalizarModoDeNavegacao("  CARDS ")).toBe("cards");
    expect(normalizarModoDeNavegacao("Direct")).toBe("direct");
  });

  it("devolve null quando não reconhece — nunca chuta um modo", () => {
    expect(normalizarModoDeNavegacao("modo_novo")).toBeNull();
    expect(normalizarModoDeNavegacao(undefined)).toBeNull();
    expect(normalizarModoDeNavegacao(null)).toBeNull();
    expect(normalizarModoDeNavegacao(42)).toBeNull();
  });
});

describe("a ordem de prioridade: escolha do lojista > padrão do layout > global", () => {
  it("a escolha do lojista ganha do padrão do layout", () => {
    // Uma pizzaria que escolheu rolagem única continua com rolagem única,
    // mesmo que o layout dela prefira outra coisa.
    expect(resolverModoDeNavegacao({ entry_mode: "direct" }, "navigation")).toBe("direct");
    expect(resolverModoDeNavegacao({ entry_mode: "cards" }, "navigation")).toBe("cards");
    expect(resolverModoDeNavegacao({ entry_mode: "navigation" }, "direct")).toBe("navigation");
  });

  it("sem escolha do lojista, vale o padrão do layout", () => {
    expect(resolverModoDeNavegacao({}, "navigation")).toBe("navigation");
    expect(resolverModoDeNavegacao(null, "cards")).toBe("cards");
  });

  it("sem escolha e sem padrão de layout, vale o padrão global", () => {
    expect(resolverModoDeNavegacao({})).toBe(MODO_PADRAO_GLOBAL);
    expect(resolverModoDeNavegacao(null)).toBe(MODO_PADRAO_GLOBAL);
    expect(resolverModoDeNavegacao(undefined)).toBe(MODO_PADRAO_GLOBAL);
  });

  it("o padrão global é a rolagem única — o cardápio que todas as lojas já viam", () => {
    // Trocar isto muda a cara de toda loja que nunca abriu a aba
    // Comportamento. Se alguém mudar de propósito, este teste avisa.
    expect(MODO_PADRAO_GLOBAL).toBe("direct");
  });

  it("valor inválido no banco não quebra o cardápio: cai no padrão", () => {
    expect(resolverModoDeNavegacao({ entry_mode: "category_cards" })).toBe(MODO_PADRAO_GLOBAL);
    expect(resolverModoDeNavegacao({ entry_mode: "" }, "navigation")).toBe("navigation");
    expect(resolverModoDeNavegacao({ entry_mode: 3 } as never)).toBe(MODO_PADRAO_GLOBAL);
  });

  it("o padrão do layout também é normalizado antes de valer", () => {
    expect(resolverModoDeNavegacao({}, "inventado" as never)).toBe(MODO_PADRAO_GLOBAL);
  });

  it("nunca lança, seja o que for que chegue", () => {
    for (const entrada of [undefined, null, 0, "", "texto", [], { entry_mode: [] }]) {
      expect(() => resolverModoDeNavegacao(entrada as never)).not.toThrow();
    }
  });
});

describe("saber se a loja escolheu ou está no automático", () => {
  it("distingue escolha explícita de ausência", () => {
    expect(lojistaEscolheuModo({ entry_mode: "cards" })).toBe(true);
    expect(lojistaEscolheuModo({})).toBe(false);
    expect(lojistaEscolheuModo(null)).toBe(false);
  });

  it("valor apagado (null) conta como automático", () => {
    // É assim que o painel desfaz uma escolha.
    expect(lojistaEscolheuModo({ entry_mode: null })).toBe(false);
  });

  it("valor sujo no banco conta como automático, não como escolha", () => {
    expect(lojistaEscolheuModo({ entry_mode: "modo_antigo" })).toBe(false);
  });
});

describe("cada loja com a sua configuração", () => {
  it("três lojas, três modos, sem um contaminar o outro", () => {
    const lojaA = { entry_mode: "cards" };
    const lojaB = { entry_mode: "direct" };
    const lojaC = { entry_mode: "navigation" };

    expect(resolverModoDeNavegacao(lojaA)).toBe("cards");
    expect(resolverModoDeNavegacao(lojaB)).toBe("direct");
    expect(resolverModoDeNavegacao(lojaC)).toBe("navigation");

    // A resolução não guarda nada entre chamadas: repetir devolve o mesmo.
    expect(resolverModoDeNavegacao(lojaA)).toBe("cards");
  });
});

describe("os padrões de cada layout de segmento", () => {
  it("todo padrão declarado é um modo que existe", () => {
    for (const layout of LAYOUTS) {
      const padrao = layout.modoDeNavegacaoPadrao;
      if (padrao !== undefined) expect(ehModoDeNavegacao(padrao)).toBe(true);
    }
  });

  it("layout com bloco de categorias pede escolher a categoria antes", () => {
    // Mercado e farmácia têm cardápio grande demais para rolar inteiro.
    for (const layout of LAYOUTS) {
      if (layout.ordem.includes("categorias")) {
        expect(layout.modoDeNavegacaoPadrao).toBe("navigation");
      }
    }
  });

  it("em TODO layout, a escolha do lojista vale nos três modos", () => {
    // A matriz de compatibilidade: nicho × modo. Nenhum layout pode ignorar
    // o que o dono da loja escolheu.
    for (const layout of LAYOUTS) {
      const padrao = layout.modoDeNavegacaoPadrao ?? null;
      for (const modo of MODOS_DE_NAVEGACAO) {
        expect(resolverModoDeNavegacao({ entry_mode: modo }, padrao)).toBe(modo);
      }
    }
  });
});

describe("visibilidade dos combos", () => {
  it("tem exatamente as três opções, com estes nomes", () => {
    expect([...VISIBILIDADES_DE_COMBOS]).toEqual(["auto", "always", "hide"]);
    for (const v of VISIBILIDADES_DE_COMBOS) expect(COMBOS_INFO[v].length).toBeGreaterThan(0);
  });

  it("automático mostra só quando existe combo cadastrado", () => {
    expect(deveMostrarCombos("auto", true)).toBe(true);
    expect(deveMostrarCombos("auto", false)).toBe(false);
  });

  it("sempre mostrar mostra até sem combo", () => {
    expect(deveMostrarCombos("always", false)).toBe(true);
  });

  it("ocultar esconde mesmo tendo combo cadastrado", () => {
    // Tira da vitrine sem apagar o cadastro.
    expect(deveMostrarCombos("hide", true)).toBe(false);
  });

  it("o que não reconhece vira automático — o comportamento de sempre", () => {
    expect(normalizarVisibilidadeDeCombos("mostrar")).toBe("auto");
    expect(normalizarVisibilidadeDeCombos(undefined)).toBe("auto");
    expect(normalizarVisibilidadeDeCombos(null)).toBe("auto");
    expect(deveMostrarCombos("qualquer coisa", true)).toBe(true);
    expect(deveMostrarCombos("qualquer coisa", false)).toBe(false);
  });

  it("lê direto das configurações da loja", () => {
    expect(visibilidadeDeCombosDe({ combos_visibility: "hide" })).toBe("hide");
    expect(visibilidadeDeCombosDe({})).toBe("auto");
    expect(visibilidadeDeCombosDe(null)).toBe("auto");
  });
});

describe("a borda da sincronização", () => {
  it("apaga a chave quando o painel manda null (voltar ao automático)", () => {
    const limpo = sanearConfiguracoesRecebidas({
      entry_mode: null,
      primary_color: "#ff0000",
    });
    expect(CHAVE_DO_MODO in limpo).toBe(false);
    expect(limpo.primary_color).toBe("#ff0000");
    // E o cardápio volta ao automático de verdade.
    expect(resolverModoDeNavegacao(limpo, "navigation")).toBe("navigation");
  });

  it("descarta modo de navegação escrito errado, sem recusar o resto", () => {
    const limpo = sanearConfiguracoesRecebidas({
      entry_mode: "category_cards",
      combos_visibility: "hide",
    });
    expect(CHAVE_DO_MODO in limpo).toBe(false);
    expect(limpo.combos_visibility).toBe("hide");
  });

  it("não mexe no que está certo", () => {
    const entrada = {
      entry_mode: "cards",
      combos_visibility: "always",
      menu_layout: "market",
      show_cart_button: false,
    };
    expect(sanearConfiguracoesRecebidas(entrada)).toEqual(entrada);
  });

  it("não altera o objeto que recebeu", () => {
    const entrada: Record<string, unknown> = { entry_mode: null };
    sanearConfiguracoesRecebidas(entrada);
    expect(entrada.entry_mode).toBeNull();
  });

  it("false e zero continuam gravados — só null apaga", () => {
    const limpo = sanearConfiguracoesRecebidas({
      show_cart_button: false,
      show_hero_button: false,
      hero_button_text: "",
    });
    expect(limpo.show_cart_button).toBe(false);
    expect(limpo.show_hero_button).toBe(false);
    expect(limpo.hero_button_text).toBe("");
  });
});

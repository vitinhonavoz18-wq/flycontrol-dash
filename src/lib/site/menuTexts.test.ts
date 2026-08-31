import { describe, expect, it } from "vitest";
import {
  CHAVE_NO_SITE_SETTINGS,
  TEXTOS_DO_CARDAPIO,
  conferirTexto,
  dividirTitulo,
  limparTexto,
  paraGravar,
  resolverTextos,
} from "./menuTexts";

/**
 * A promessa mais importante deste arquivo: LOJA QUE NUNCA MEXEU NOS TEXTOS
 * CONTINUA VENDO EXATAMENTE O QUE VIA.
 *
 * O resto — limite de tamanho, limpeza, restaurar padrão — é consequência.
 */

const PADRAO_BADGE = "Curadoria Gastronômica";
const PADRAO_TITULO = "Nossa Cozinha";
const PADRAO_DESCRICAO =
  "Selecione uma categoria para descobrir nossas especialidades artesanais de alta qualidade.";

describe("nada muda para quem nunca editou", () => {
  it.each([
    ["configurações inexistentes", null],
    ["configurações vazias", {}],
    ["configurações de outras coisas", { menu_layout: "generic", show_categories_section: false }],
    ["pacote vazio", { [CHAVE_NO_SITE_SETTINGS]: {} }],
    ["pacote nulo", { [CHAVE_NO_SITE_SETTINGS]: null }],
    ["pacote com formato errado", { [CHAVE_NO_SITE_SETTINGS]: "texto solto" }],
    ["pacote que virou lista", { [CHAVE_NO_SITE_SETTINGS]: ["a", "b"] }],
    ["campos em branco", { [CHAVE_NO_SITE_SETTINGS]: { menu_title: "", menu_badge: "   " } }],
    ["campos com tipo errado", { [CHAVE_NO_SITE_SETTINGS]: { menu_title: 42, menu_badge: true } }],
  ])("%s cai no texto que já estava no ar", (_caso, entrada) => {
    const t = resolverTextos(entrada);
    expect(t.menu_badge).toBe(PADRAO_BADGE);
    expect(t.menu_title).toBe(PADRAO_TITULO);
    expect(t.menu_description).toBe(PADRAO_DESCRICAO);
  });

  it("os padrões são exatamente as frases que estavam no cardápio", () => {
    // Se alguém trocar um padrão sem querer, o cardápio de centenas de lojas
    // mudaria de uma vez. Este teste é o alarme.
    const porChave = Object.fromEntries(TEXTOS_DO_CARDAPIO.map((d) => [d.chave, d.padrao]));
    expect(porChave.menu_badge).toBe(PADRAO_BADGE);
    expect(porChave.menu_title).toBe(PADRAO_TITULO);
    expect(porChave.menu_description).toBe(PADRAO_DESCRICAO);
  });
});

describe("texto personalizado aparece", () => {
  it("substitui só o que foi escrito, mantendo o resto no padrão", () => {
    const t = resolverTextos({
      [CHAVE_NO_SITE_SETTINGS]: { menu_title: "Sabores da Casa" },
    });
    expect(t.menu_title).toBe("Sabores da Casa");
    expect(t.menu_badge).toBe(PADRAO_BADGE);
    expect(t.menu_description).toBe(PADRAO_DESCRICAO);
  });

  it("convive com as outras configurações da loja sem atrapalhar", () => {
    const t = resolverTextos({
      menu_layout: "pharmacy",
      show_categories_section: true,
      [CHAVE_NO_SITE_SETTINGS]: { menu_badge: "Farmácia 24h" },
    });
    expect(t.menu_badge).toBe("Farmácia 24h");
  });
});

describe("limpeza do que foi digitado", () => {
  it("tira marcação de HTML", () => {
    // Sem isto, um pedaço de código colado no campo iria parar na página do
    // cliente final.
    expect(limparTexto("<b>Oi</b>", "menu_title")).toBe("Oi");
    expect(limparTexto("<script>alert(1)</script>Loja", "menu_title")).toBe("alert(1)Loja");
    expect(limparTexto("<img src=x onerror=y>", "menu_title")).toBe("");
  });

  it("junta espaços repetidos e tira as pontas", () => {
    expect(limparTexto("  Nossa    Cozinha  ", "menu_title")).toBe("Nossa Cozinha");
    expect(limparTexto("linha1\nlinha2", "menu_description")).toBe("linha1 linha2");
  });

  it("corta no limite de cada campo", () => {
    expect(limparTexto("a".repeat(200), "menu_badge")).toHaveLength(50);
    expect(limparTexto("a".repeat(200), "menu_title")).toHaveLength(50);
    expect(limparTexto("a".repeat(500), "menu_description")).toHaveLength(200);
  });

  it("texto só de espaços vira vazio, e vazio vira o padrão", () => {
    expect(limparTexto("     ", "menu_title")).toBe("");
    expect(resolverTextos({ [CHAVE_NO_SITE_SETTINGS]: { menu_title: "     " } }).menu_title).toBe(
      PADRAO_TITULO,
    );
  });

  it("aceita acento, emoji e pontuação sem estragar", () => {
    expect(limparTexto("Pizzaria do Zé 🍕", "menu_title")).toBe("Pizzaria do Zé 🍕");
  });
});

describe("aviso para quem está digitando", () => {
  it("reclama de texto grande demais", () => {
    expect(conferirTexto("a".repeat(51), "menu_badge")).toMatch(/50/);
    expect(conferirTexto("a".repeat(50), "menu_badge")).toBeNull();
  });

  it("reclama de texto só com espaços", () => {
    expect(conferirTexto("   ", "menu_title")).not.toBeNull();
  });

  it("reclama de sinais de HTML", () => {
    expect(conferirTexto("<b>Oi</b>", "menu_title")).not.toBeNull();
  });

  it("campo vazio é permitido — é assim que se volta ao padrão", () => {
    expect(conferirTexto("", "menu_title")).toBeNull();
  });
});

describe("o que vai para o banco", () => {
  it("não grava campo vazio", () => {
    expect(paraGravar({ menu_title: "", menu_badge: "  " })).toEqual({});
  });

  it("não grava texto igual ao padrão", () => {
    // Guardar o padrão faria a loja ficar presa nele: se um dia mudássemos a
    // frase de fábrica, essa loja não receberia a nova.
    expect(paraGravar({ menu_title: PADRAO_TITULO })).toEqual({});
  });

  it("grava só o que foi realmente personalizado, já limpo", () => {
    expect(paraGravar({ menu_title: "  <b>Sabores</b>  da Casa ", menu_badge: "" })).toEqual({
      menu_title: "Sabores da Casa",
    });
  });

  it("o que é gravado volta igual ao ser lido", () => {
    const gravado = paraGravar({ menu_title: "Sabores da Casa", menu_badge: "Delivery 24h" });
    const lido = resolverTextos({ [CHAVE_NO_SITE_SETTINGS]: gravado });
    expect(lido.menu_title).toBe("Sabores da Casa");
    expect(lido.menu_badge).toBe("Delivery 24h");
    expect(lido.menu_description).toBe(PADRAO_DESCRICAO);
  });
});

describe("a última palavra do título sai na cor da loja", () => {
  it("mantém o visual de hoje no texto padrão", () => {
    expect(dividirTitulo("Nossa Cozinha")).toEqual({ inicio: "Nossa ", destaque: "Cozinha" });
  });

  it("vale para o que o lojista escrever", () => {
    expect(dividirTitulo("Sabores da Casa")).toEqual({ inicio: "Sabores da ", destaque: "Casa" });
  });

  it("título de uma palavra só fica inteiro na cor", () => {
    expect(dividirTitulo("Cardápio")).toEqual({ inicio: "", destaque: "Cardápio" });
  });

  it("não quebra com espaços sobrando", () => {
    expect(dividirTitulo("  Nossa   Cozinha  ")).toEqual({ inicio: "Nossa ", destaque: "Cozinha" });
  });
});

describe("pronto para crescer", () => {
  it("todo texto do catálogo tem tudo que a tela precisa", () => {
    for (const d of TEXTOS_DO_CARDAPIO) {
      expect(d.chave, "chave").toBeTruthy();
      expect(d.rotulo, `rótulo de ${d.chave}`).toBeTruthy();
      expect(d.ajuda, `ajuda de ${d.chave}`).toBeTruthy();
      expect(d.padrao, `padrão de ${d.chave}`).toBeTruthy();
      expect(d.maximo, `limite de ${d.chave}`).toBeGreaterThan(0);
      // O padrão precisa caber no próprio limite, senão a tela abriria já
      // acusando erro num texto que ninguém digitou.
      expect(d.padrao.length, `padrão de ${d.chave} cabe no limite`).toBeLessThanOrEqual(d.maximo);
    }
  });

  it("não existe chave repetida", () => {
    const chaves = TEXTOS_DO_CARDAPIO.map((d) => d.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

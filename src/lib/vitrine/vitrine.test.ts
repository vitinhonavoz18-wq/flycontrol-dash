import { describe, expect, it } from "vitest";
import {
  alternarTipos,
  classificarComida,
  enderecoPermitido,
  ITEM_RESERVA,
  larguraNormalizada,
  montarSequencia,
  normalizarVitrine,
  type ItemDaVitrine,
  type TipoDeComida,
} from "./vitrine";

const item = (
  id: string,
  tipo: TipoDeComida,
  extra: Partial<ItemDaVitrine> = {},
): ItemDaVitrine => ({
  id,
  nome: id,
  tipo,
  imagem: `https://flycontrol.conectfly.com.br/api/public/midia/p/public/hero-showcase/${id}.webp`,
  imagemPequena: `https://flycontrol.conectfly.com.br/api/public/midia/p/public/hero-showcase/${id}-640.webp`,
  largura: 1000,
  altura: 1000,
  preenchimento: 0.6,
  ...extra,
});

describe("tipo de comida", () => {
  it.each([
    ["X-Bacon", null, "hamburguer"],
    ["Smash Burger duplo", null, "hamburguer"],
    ["Hambúrguer da casa", null, "hamburguer"],
    ["Calabresa", "Pizzas Tradicionais", "pizza"],
    ["Pizza Portuguesa G", null, "pizza"],
    ["Açaí 500ml", null, "acai"],
    ["Acai com granola", null, "acai"],
    ["Pastel de carne", null, "pastel"],
    ["Combinado 20 peças", "Sushi", "japonesa"],
    ["Temaki salmão", null, "japonesa"],
    ["Coxinha", null, "salgado"],
    ["Brownie", null, "doce"],
    ["Parmegiana de frango", null, "prato"],
    ["Tapioca de queijo", null, "lanche"],
    ["Especial do chef", null, "outro"],
  ])("%s (%s) → %s", (nome, categoria, esperado) => {
    expect(classificarComida(nome, categoria)).toBe(esperado);
  });

  it("o nome do produto vale mais que a categoria", () => {
    // Calzone dentro da categoria Pizzas é salgado, não pizza.
    expect(classificarComida("Calzone de presunto", "Pizzas")).toBe("salgado");
  });
});

describe("ordem da vitrine", () => {
  it("não mostra dois do mesmo tipo seguidos quando há alternativa", () => {
    const ordem = alternarTipos([
      item("h1", "hamburguer"),
      item("h2", "hamburguer"),
      item("h3", "hamburguer"),
      item("p1", "pizza"),
      item("a1", "acai"),
    ]).map((i) => i.tipo);
    for (let i = 1; i < ordem.length; i++) {
      if (ordem.filter((t) => t === "hamburguer").length <= 3) {
        // Com 3 hambúrgueres e 2 outros, dá para alternar sem repetir.
        expect(ordem[i]).not.toBe(ordem[i - 1]);
      }
    }
  });

  it("respeita a ordem escolhida quando ela já alterna", () => {
    const lista = [item("h", "hamburguer"), item("p", "pizza"), item("a", "acai")];
    expect(alternarTipos(lista).map((i) => i.id)).toEqual(["h", "p", "a"]);
  });

  it("evita que o último e o primeiro (volta da roda) sejam do mesmo tipo", () => {
    const ordem = alternarTipos([
      item("h1", "hamburguer"),
      item("p1", "pizza"),
      item("a1", "acai"),
      item("p2", "pizza"),
      item("h2", "hamburguer"),
    ]);
    expect(ordem[ordem.length - 1].tipo).not.toBe(ordem[0].tipo);
  });

  it("só hambúrguer: mantém tudo, sem travar", () => {
    const lista = [item("h1", "hamburguer"), item("h2", "hamburguer")];
    expect(alternarTipos(lista)).toHaveLength(2);
  });
});

describe("tamanho igualado entre produtos", () => {
  const r = 0.92;
  it("pizza que ocupa a foto toda não fica maior que um lanche", () => {
    const pizza = larguraNormalizada({ largura: 1000, altura: 1000, preenchimento: 0.85 }, r);
    const lanche = larguraNormalizada({ largura: 1000, altura: 1000, preenchimento: 0.65 }, r);
    // Mesma área de comida: quem preenche mais aparece com caixa menor.
    expect(pizza).toBeLessThan(lanche);
    const areaPizza = pizza ** 2 * 0.85;
    const areaLanche = lanche ** 2 * 0.65;
    expect(Math.abs(areaPizza - areaLanche) / areaLanche).toBeLessThan(0.02);
  });

  it("nunca passa do limite da vitrine (nem na largura, nem na altura)", () => {
    const largo = larguraNormalizada({ largura: 3000, altura: 600, preenchimento: 0.3 }, r);
    const alto = larguraNormalizada({ largura: 500, altura: 1500, preenchimento: 0.3 }, r);
    expect(largo).toBeLessThanOrEqual(78);
    // Altura do alto: largura / aspecto / proporção ≤ 78%.
    expect(alto / (500 / 1500) / r).toBeLessThanOrEqual(78.1);
  });

  it("dados estranhos não quebram a conta", () => {
    expect(
      Number.isFinite(larguraNormalizada({ largura: 0, altura: 0, preenchimento: 0 }, r)),
    ).toBe(true);
  });
});

describe("o que chega do servidor", () => {
  const origem = "https://flycontrol.conectfly.com.br";

  it("aceita só imagens do nosso cache ou do depósito da vitrine", () => {
    expect(enderecoPermitido(`${origem}/api/public/midia/p/public/hero-showcase/a.webp`)).toBe(
      true,
    );
    expect(
      enderecoPermitido("https://abc.supabase.co/storage/v1/object/public/hero-showcase/a.webp"),
    ).toBe(true);
    expect(
      enderecoPermitido("https://abc.supabase.co/storage/v1/object/public/menu-images/a.webp"),
    ).toBe(false);
    expect(enderecoPermitido("https://site-qualquer.com/a.webp")).toBe(false);
    expect(enderecoPermitido("javascript:alert(1)")).toBe(false);
  });

  it("descarta itens inválidos, repetidos e de origem estranha", () => {
    const itens = normalizarVitrine(
      {
        itens: [
          {
            id: "1",
            nome: "Pizza",
            tipo: "pizza",
            imagem: `${origem}/api/public/midia/x/public/hero-showcase/1.webp`,
            largura: 800,
            altura: 600,
            preenchimento: 0.7,
          },
          {
            id: "1",
            nome: "Repetido",
            tipo: "pizza",
            imagem: `${origem}/api/public/midia/x/public/hero-showcase/1.webp`,
          },
          { id: "2", nome: "Fora", tipo: "pizza", imagem: "https://malicioso.com/x.webp" },
          { id: "", imagem: `${origem}/api/public/midia/x/public/hero-showcase/3.webp` },
          {
            id: "4",
            tipo: "inventado",
            imagem: `${origem}/api/public/midia/x/public/hero-showcase/4.webp`,
          },
        ],
      },
      origem,
    );
    expect(itens.map((i) => i.id)).toEqual(["1", "4"]);
    expect(itens[1].tipo).toBe("outro");
    expect(itens[1].nome).toBe("Produto");
    expect(itens[0].imagemPequena).toBe(itens[0].imagem);
  });

  it("resposta quebrada vira lista vazia, não erro", () => {
    expect(normalizarVitrine(null)).toEqual([]);
    expect(normalizarVitrine({ itens: "x" })).toEqual([]);
  });
});

describe("sequência final", () => {
  it("sem produtos de verdade: o hambúrguer da marca", () => {
    expect(montarSequencia([])).toEqual([ITEM_RESERVA]);
  });

  it("um produto só: alterna com o hambúrguer da marca", () => {
    expect(montarSequencia([item("p", "pizza")]).map((i) => i.id)).toEqual([ITEM_RESERVA.id, "p"]);
  });

  it("dois ou mais: só os produtos de verdade", () => {
    const seq = montarSequencia([item("p", "pizza"), item("a", "acai")]);
    expect(seq.map((i) => i.id)).not.toContain(ITEM_RESERVA.id);
  });

  it("imagem que falhou sai da roda", () => {
    const seq = montarSequencia(
      [item("p", "pizza"), item("a", "acai"), item("h", "hamburguer")],
      new Set(["a"]),
    );
    expect(seq.map((i) => i.id).sort()).toEqual(["h", "p"]);
  });

  it("o produto reserva vem com o próprio site e tem medidas reais", () => {
    expect(ITEM_RESERVA.imagem).toBeTruthy();
    expect(ITEM_RESERVA.largura).toBeGreaterThan(0);
    expect(ITEM_RESERVA.preenchimento).toBeGreaterThan(0);
  });
});

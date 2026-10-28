import { describe, expect, it } from "vitest";
import {
  ehPizzaria,
  gradeParaPrecos,
  montarCatalogoDoPainel,
  textoParaIngredientes,
} from "./catalogoDoPainel";
import { calcularPizza, validarConfigPizzaria } from "./motorDePreco";

describe("aba Pizzaria do painel", () => {
  it("1. a aba só existe para quem usa o layout de pizzaria", () => {
    expect(ehPizzaria({ site_settings: { menu_layout: "pizza" } })).toBe(true);
    expect(ehPizzaria({ site_settings: { menu_layout: "pharmacy" } })).toBe(false);
    expect(ehPizzaria(null)).toBe(false);
  });

  it("grade de preços aceita 59,90 / 59.90 / 1.234,50, ignora vazio e aponta o inválido", () => {
    expect(
      gradeParaPrecos({ Grande: "59,90", Média: "49.90", Família: "1.234,50", Broto: "" }),
    ).toEqual({
      precos: { grande: 5990, media: 4990, familia: 123450 },
      invalidos: [],
    });
    expect(gradeParaPrecos({ Grande: "abc", Média: "-1" }).invalidos).toEqual(["Grande", "Média"]);
  });

  it("ingredientes: vírgula separa, espaço some e repetido não entra", () => {
    expect(textoParaIngredientes("cebola, Azeitona ,, cebola;orégano")).toEqual([
      "cebola",
      "Azeitona",
      "orégano",
    ]);
  });

  it("simulador usa as mesmas contas do site (média ponderada com borda por tamanho)", () => {
    const catalogo = montarCatalogoDoPainel({
      tamanhos: [{ name: "Grande", price: 50, max_flavors: 2, active: true }],
      sabores: [
        { id: "a", name: "Calabresa", pizza_size_prices_cents: { grande: 5000 } },
        { id: "b", name: "Camarão", pizza_size_prices_cents: { grande: 8000 } },
      ],
      complementos: [
        {
          id: "c",
          name: "Catupiry",
          price: 8,
          extra_type: "borda",
          pizza_size_prices_cents: { grande: 1200 },
        },
        { id: "d", name: "Bacon", price: 5, extra_type: "adicional", max_quantity: 2 },
      ],
      siteSettings: { pizza_premium: { regra: "media_ponderada" } },
    });
    const r = calcularPizza(catalogo, {
      tamanho: "Grande",
      sabores: [{ id: "a" }, { id: "b" }],
      bordaId: "c",
      adicionais: [{ id: "d", quantidade: 2 }],
    });
    expect(r.ok && r.pizza.precoUnitarioCentavos).toBe(6500 + 1200 + 1000);
    expect(catalogo.adicionais[0].maxQuantidade).toBe(2);
  });

  it("13. conferência impede publicar borda obrigatória sem borda ativa", () => {
    const catalogo = montarCatalogoDoPainel({
      tamanhos: [{ name: "Grande", price: 50, max_flavors: 2 }],
      sabores: [{ id: "a", name: "Calabresa" }],
      complementos: [{ id: "c", name: "Catupiry", price: 8, extra_type: "borda", active: false }],
      siteSettings: { pizza_premium: { bordaObrigatoria: true } },
    });
    expect(validarConfigPizzaria(catalogo)).toContain(
      "A borda está marcada como obrigatória, mas não há nenhuma borda ativa.",
    );
  });
});

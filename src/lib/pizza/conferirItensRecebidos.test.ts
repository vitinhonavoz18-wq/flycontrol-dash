import { describe, expect, it } from "vitest";
import { conferirItensRecebidos } from "./conferirItensRecebidos";
import { CONFIG_PADRAO, calcularPizza, registrarPizza, type CatalogoDePizza } from "./motorDePreco";

const catalogo: CatalogoDePizza = {
  config: { ...CONFIG_PADRAO, regra: "media_ponderada" },
  tamanhos: [
    {
      chave: "grande",
      nome: "Grande",
      precoBaseCentavos: 5000,
      maxSabores: 3,
      fatias: 8,
      ativo: true,
    },
  ],
  sabores: [
    {
      id: "a",
      nome: "Calabresa",
      ativo: true,
      precosPorTamanho: { grande: 5000 },
      extraEspecialCentavos: 0,
      ingredientes: [],
    },
    {
      id: "b",
      nome: "Camarão",
      ativo: true,
      precosPorTamanho: { grande: 8000 },
      extraEspecialCentavos: 0,
      ingredientes: [],
    },
  ],
  bordas: [],
  adicionais: [
    {
      id: "x",
      nome: "Bacon",
      ativo: true,
      precoCentavos: 500,
      precosPorTamanho: {},
      maxQuantidade: 3,
    },
  ],
};

function itemOficial(quantidade = 2) {
  const r = calcularPizza(catalogo, {
    tamanho: "grande",
    sabores: [{ id: "a" }, { id: "b" }],
    adicionais: [{ id: "x", quantidade: 2 }],
    quantidade,
  });
  if (!r.ok) throw new Error("montagem de teste inválida");
  const pizza = registrarPizza(r.pizza);
  return {
    type: "pizza",
    name: "Pizza Grande",
    quantity: pizza.quantidade,
    unit_price: pizza.preco_unitario_centavos / 100,
    total_price: pizza.total_centavos / 100,
    pizza,
  };
}

const bebida = { type: "beverage", name: "Coca", quantity: 1, unit_price: 12, total_price: 12 };

describe("FlyControl confere a fotografia da pizza ao receber o pedido", () => {
  it("21. pedido com pizza certa é aceito (média 65 + bacon 2x5 = 75, x2)", () => {
    const p = itemOficial();
    expect(p.unit_price).toBe(75);
    expect(conferirItensRecebidos({ itens: [p, bebida], subtotalEnviado: 162 })).toEqual({
      ok: true,
      pizzas: 1,
    });
  });

  it("15. preço do item adulterado é recusado mesmo com a fotografia certa", () => {
    const p = { ...itemOficial(), unit_price: 10, total_price: 20 };
    const r = conferirItensRecebidos({ itens: [p], subtotalEnviado: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok && r.motivo === "pizza_inconsistente") {
      expect(r.problemas[0].erros).toContain("o preço do item é diferente do preço da pizza");
    }
  });

  it("15. fotografia adulterada (preço dos sabores fora da regra) é recusada", () => {
    const p = itemOficial(1);
    p.pizza = {
      ...p.pizza,
      preco_sabores_centavos: 100,
      preco_unitario_centavos: 1100,
      total_centavos: 1100,
    };
    p.unit_price = 11;
    p.total_price = 11;
    const r = conferirItensRecebidos({ itens: [p], subtotalEnviado: 11 });
    expect(r).toMatchObject({ ok: false, motivo: "pizza_inconsistente" });
  });

  it("subtotal menor que a soma dos itens é recusado", () => {
    const r = conferirItensRecebidos({ itens: [itemOficial(), bebida], subtotalEnviado: 50 });
    expect(r).toEqual({
      ok: false,
      motivo: "subtotal_inconsistente",
      subtotal_enviado_centavos: 5000,
      soma_dos_itens_centavos: 16200,
    });
  });

  it("quantidade do item diferente da fotografia é recusada", () => {
    const p = { ...itemOficial(2), quantity: 5 };
    const r = conferirItensRecebidos({ itens: [p], subtotalEnviado: 375 });
    expect(r).toMatchObject({ ok: false, motivo: "pizza_inconsistente" });
  });

  it("20. pedido antigo, sem fotografia, passa como sempre passou", () => {
    const antiga = {
      type: "pizza",
      name: "Pizza",
      size: "G",
      flavors: ["Calabresa"],
      quantity: 1,
      unit_price: 40,
    };
    expect(conferirItensRecebidos({ itens: [antiga, bebida], subtotalEnviado: 999 })).toEqual({
      ok: true,
      pizzas: 0,
    });
  });
});

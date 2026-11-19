import { describe, expect, it } from "vitest";
import { planejarProdutosNormalizados } from "./importarProdutosNormalizados";

const data = "2026-11-19T20:00:00.000Z";

describe("importação do cardápio público", () => {
  it("vincula os 45 produtos aos IDs existentes, mantendo fotos e tipos compatíveis", async () => {
    const existentes = Array.from({ length: 45 }, (_, i) => ({
      id: `local-${i}`,
      external_id: i % 2 ? `publico-${i}` : null,
      name: `Marmitex ${i}`,
      category_id: "marmitex",
      product_type: i % 2 ? "standard" : "product",
    }));
    const recebidos = existentes.map((registro, i) => ({
      categoria: "marmitex",
      item: {
        external_id: `sf_prod_publico-${i}`,
        name: registro.name,
        image_url: i === 3 ? "https://cardapio.exemplo/foto.webp" : null,
        type: "product",
      },
    }));
    const lote = await planejarProdutosNormalizados("loja", recebidos, existentes, data);
    expect(lote.map((p) => p.id)).toEqual(existentes.map((p) => p.id));
    expect(lote[0].external_id).toBe("sf_prod_publico-0");
    expect(lote[3]).toMatchObject({
      external_id: "publico-3",
      product_type: "standard",
      image_url: "https://cardapio.exemplo/foto.webp",
    });
  });

  it("usa IDs estáveis por loja e mantém separados os itens de mesmo nome com IDs diferentes", async () => {
    const um = {
      categoria: "bebidas",
      item: { name: "Refrigerante", external_id: "sf_drink_um", type: "drink" },
    };
    const dois = {
      categoria: "bebidas",
      item: { name: "Refrigerante", external_id: "sf_drink_dois", type: "drink" },
    };
    const recebidos = [um, dois, { ...um, item: { ...um.item, price: 9.5 } }];
    const lote = await planejarProdutosNormalizados("loja", recebidos, [], data);
    const repetido = await planejarProdutosNormalizados("loja", recebidos, [], data);
    const outraLoja = await planejarProdutosNormalizados("outra", [um], [], data);

    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({ price: 9.5, product_type: "beverage" });
    expect(lote).toEqual(repetido);
    expect(lote[0].id).not.toBe(outraLoja[0].id);
  });
});

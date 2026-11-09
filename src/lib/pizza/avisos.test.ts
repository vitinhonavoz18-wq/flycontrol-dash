import { describe, expect, it } from "vitest";
import { avisosDaPizzaria } from "./avisos";
import { CONFIG_PADRAO, type CatalogoDePizza } from "./motorDePreco";

function catalogo(regra: CatalogoDePizza["config"]["regra"], precos: Record<string, number>) {
  return {
    config: { ...CONFIG_PADRAO, regra },
    tamanhos: [
      {
        chave: "grande",
        nome: "Grande",
        precoBaseCentavos: 4790,
        maxSabores: 2,
        fatias: 8,
        ativo: true,
      },
    ],
    sabores: [
      {
        id: "a",
        nome: "Atum",
        ativo: true,
        precosPorTamanho: precos,
        extraEspecialCentavos: 0,
        ingredientes: [],
      },
    ],
    bordas: [],
    adicionais: [],
  } as CatalogoDePizza;
}

describe("avisos da aba Pizzaria", () => {
  it("avisa quando há preço por sabor mas a regra os ignora (caso rocketpizzaria)", () => {
    const avisos = avisosDaPizzaria(catalogo("tamanho_e_especiais", { grande: 5290 }));
    expect(avisos.map((a) => a.codigo)).toEqual(["precos_ignorados_pela_regra"]);
    expect(avisos[0].mensagem).toMatch(/Atum/);
    expect(avisos[0].mensagem).toMatch(/Maior preço/);
  });

  it("não avisa quando a regra usa o preço de cada sabor", () => {
    expect(avisosDaPizzaria(catalogo("maior_preco", { grande: 5290 }))).toEqual([]);
    expect(avisosDaPizzaria(catalogo("media_ponderada", { grande: 5290 }))).toEqual([]);
  });

  it("não avisa na regra antiga quando ninguém cadastrou preço por sabor", () => {
    expect(avisosDaPizzaria(catalogo("tamanho_e_especiais", {}))).toEqual([]);
  });

  it("avisa da categoria de pizza que ainda não existe no site", () => {
    const avisos = avisosDaPizzaria(catalogo("maior_preco", {}), {
      categoriasSemSite: ["Pizzas Doces"],
    });
    expect(avisos[0].codigo).toBe("categoria_sem_site");
    expect(avisos[0].mensagem).toMatch(/Pizzas Doces/);
  });
});

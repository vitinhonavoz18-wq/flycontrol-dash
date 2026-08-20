import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS,
  MENU_IMPORT_EXAMPLE,
  countEntries,
  parseMenuImport,
  parsePrice,
} from "./importSchema";

describe("preço", () => {
  it("aceita número, texto e o formato brasileiro com vírgula", () => {
    expect(parsePrice(45.9)).toBe(45.9);
    expect(parsePrice("45.90")).toBe(45.9);
    expect(parsePrice("45,90")).toBe(45.9);
    expect(parsePrice("R$ 45,90")).toBe(45.9);
    expect(parsePrice("1.234,56")).toBe(1234.56);
    expect(parsePrice(0)).toBe(0);
  });

  it("arredonda para centavos, sem sobra de casa decimal", () => {
    expect(parsePrice(45.999)).toBe(46);
    expect(parsePrice(10.005)).toBe(10.01);
  });

  it("recusa o que não é preço", () => {
    for (const value of ["", "grátis", "abc", null, undefined, {}, [], -5, NaN, Infinity]) {
      expect(parsePrice(value)).toBeNull();
    }
  });
});

describe("modelo de exemplo", () => {
  it("o exemplo mostrado na tela é válido — senão o dono copia algo quebrado", () => {
    const result = parseMenuImport(MENU_IMPORT_EXAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categorias).toHaveLength(2);
    expect(result.data.categorias[0].itens).toHaveLength(2);
    expect(result.data.bebidas).toHaveLength(1);
    expect(result.data.bordas).toHaveLength(1);
    expect(result.data.adicionais).toHaveLength(1);
    expect(countEntries(result.data)).toBe(2 + 3 + 1 + 1 + 1);
  });
});

describe("leitura do arquivo", () => {
  it("aponta erro de JSON quebrado sem despejar o texto todo", () => {
    const result = parseMenuImport('{ "categorias": [ }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/não é um JSON válido/i);
  });

  it("recusa arquivo vazio", () => {
    expect(parseMenuImport("   ").ok).toBe(false);
    expect(parseMenuImport("{}").ok).toBe(false);
  });

  it("recusa quando a raiz não é um objeto", () => {
    const result = parseMenuImport("[1,2,3]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/precisa começar com \{/);
  });

  it("aponta TODOS os erros de uma vez, com a posição de cada um", () => {
    const result = parseMenuImport(
      JSON.stringify({
        categorias: [{ nome: "Pizzas", itens: [{ nome: "Calabresa" }, { preco: 10 }] }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("categorias[0].itens[0]");
    expect(result.errors[0]).toMatch(/preco/);
    expect(result.errors[1]).toContain("categorias[0].itens[1]");
    expect(result.errors[1]).toMatch(/nome/);
  });

  it("avisa sobre campo escrito errado em vez de ignorar calado", () => {
    const result = parseMenuImport(
      JSON.stringify({ categoria: [{ nome: "X", itens: [{ nome: "Y", preco: 1 }] }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('"categoria"'))).toBe(true);
  });

  it("aceita categoria sem itens, para preencher depois", () => {
    const result = parseMenuImport(JSON.stringify({ categorias: [{ nome: "Em breve" }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categorias[0].itens).toEqual([]);
  });

  it("limpa espaços sobrando do nome", () => {
    const result = parseMenuImport(
      JSON.stringify({ bordas: [{ nome: "  Catupiry   Original  ", preco: "8,00" }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bordas[0].nome).toBe("Catupiry Original");
  });

  it("descrição vazia não vira texto em branco no cardápio", () => {
    const result = parseMenuImport(
      JSON.stringify({ bebidas: [{ nome: "Água", preco: 5, descricao: "   " }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bebidas[0].descricao).toBeUndefined();
  });

  it("recusa lista que não é lista", () => {
    const result = parseMenuImport(JSON.stringify({ bordas: { nome: "X", preco: 1 } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/lista entre colchetes/);
  });

  it("barra arquivo grande demais em vez de disparar centenas de gravações", () => {
    const bebidas = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({
      nome: `Item ${i}`,
      preco: 1,
    }));
    const result = parseMenuImport(JSON.stringify({ bebidas }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes(String(MAX_ITEMS)))).toBe(true);
  });
});

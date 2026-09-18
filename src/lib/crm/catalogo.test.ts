/* O banco de mentira imita a corrente de chamadas do supabase-js, que não tem
   um tipo público simples para imitar. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { montarCatalogo, comboNoAr } from "./catalogo";

/**
 * O cardápio que a IA lê.
 *
 * O ESTRAGO QUE ESTES TESTES EVITAM
 *
 * Uma atendente automática que oferece o que acabou é pior do que nenhuma: o
 * cliente pede, fecha o pedido, e o restaurante precisa desdizer o próprio
 * atendimento na frente dele. Custa a venda e custa a confiança.
 */

/** Um banco de mentira, que responde o que cada consulta pediria. */
function bancoFalso(dados: Record<string, unknown[]>, loja: Record<string, unknown>) {
  const construir = (tabela: string) => {
    const q: any = {
      _tabela: tabela,
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: loja }),
      then: (resolve: (v: unknown) => void) => resolve({ data: dados[tabela] ?? [] }),
    };
    return q;
  };
  return { from: (t: string) => construir(t) };
}

const LOJA = {
  name: "Pizzaria do Zé",
  business_type: "pizzaria",
  is_open: true,
  delivery_enabled: true,
};

const BASE = {
  menu_categories: [{ id: "cat-1", name: "Pizzas", active: true, order_index: 1 }],
  menu_products: [
    {
      id: "p1",
      category_id: "cat-1",
      name: "Calabresa",
      description: "com cebola",
      price: 45.9,
      active: true,
      available: true,
    },
  ],
  pizzeria_pizza_sizes: [],
  combos: [],
  menu_extras: [],
  menu_product_inventory_links: [],
};

describe("o que a IA pode oferecer", () => {
  it("mostra o produto disponível com preço em centavos", async () => {
    const c = await montarCatalogo(bancoFalso(BASE, LOJA), "loja-1");
    expect(c.cardapio[0].categoria).toBe("Pizzas");
    expect(c.cardapio[0].itens[0].nome).toBe("Calabresa");
    // Dinheiro sempre em centavos inteiros: 45.9 reais = 4590 centavos.
    expect(c.cardapio[0].itens[0].preco_cents).toBe(4590);
  });

  it("escreve o cardápio em português, pronto para o prompt", async () => {
    const c = await montarCatalogo(bancoFalso(BASE, LOJA), "loja-1");
    expect(c.texto).toContain("PIZZARIA DO ZÉ");
    expect(c.texto).toContain("Calabresa");
    // O formato de moeda do português usa um espaço ESPECIAL entre "R$" e o
    // número (o que não deixa a linha quebrar no meio do preço). Comparar com
    // espaço comum falha por um caractere invisível — daí o regex.
    expect(c.texto).toMatch(/R\$\s45,90/);
    // A trava contra invenção precisa estar escrita para o modelo ler.
    expect(c.texto).toContain("SOMENTE");
  });
});

describe("o que a IA NÃO pode oferecer", () => {
  it("item desligado no cardápio some da lista", async () => {
    const dados = {
      ...BASE,
      menu_products: [{ ...BASE.menu_products[0], available: false }],
    };
    const c = await montarCatalogo(bancoFalso(dados, LOJA), "loja-1");
    expect(c.cardapio).toHaveLength(0);
    expect(c.texto).not.toContain("Calabresa");
    expect(c.indisponiveis[0]).toContain("Calabresa");
  });

  it("item sem ingrediente no estoque some da lista", async () => {
    // Este é o coração do pedido: a IA sabendo do estoque.
    const dados = {
      ...BASE,
      menu_product_inventory_links: [
        {
          menu_product_id: "p1",
          quantity_base: 1,
          inventory_products: {
            name: "Calabresa (kg)",
            stock_base: 0,
            allow_negative_stock: false,
            active: true,
          },
        },
      ],
    };
    const c = await montarCatalogo(bancoFalso(dados, LOJA), "loja-1");
    expect(c.cardapio).toHaveLength(0);
    expect(c.indisponiveis[0]).toContain("sem ingrediente");
  });

  it("estoque menor que a receita também derruba o item", async () => {
    const dados = {
      ...BASE,
      menu_product_inventory_links: [
        {
          menu_product_id: "p1",
          quantity_base: 5,
          inventory_products: {
            name: "Calabresa (kg)",
            stock_base: 2,
            allow_negative_stock: false,
            active: true,
          },
        },
      ],
    };
    const c = await montarCatalogo(bancoFalso(dados, LOJA), "loja-1");
    expect(c.cardapio).toHaveLength(0);
  });

  it("loja que aceita estoque negativo continua vendendo", async () => {
    // Quem permite negativo prefere vender e repor depois. Não cabe ao
    // sistema decidir o contrário por ela.
    const dados = {
      ...BASE,
      menu_product_inventory_links: [
        {
          menu_product_id: "p1",
          quantity_base: 1,
          inventory_products: {
            name: "Calabresa (kg)",
            stock_base: 0,
            allow_negative_stock: true,
            active: true,
          },
        },
      ],
    };
    const c = await montarCatalogo(bancoFalso(dados, LOJA), "loja-1");
    expect(c.cardapio[0].itens).toHaveLength(1);
  });

  it("o indisponível NÃO aparece no texto que a IA lê", async () => {
    // De propósito: modelo que lê "indisponível" acaba oferecendo assim mesmo.
    const dados = {
      ...BASE,
      menu_products: [
        BASE.menu_products[0],
        { ...BASE.menu_products[0], id: "p2", name: "Portuguesa", available: false },
      ],
    };
    const c = await montarCatalogo(bancoFalso(dados, LOJA), "loja-1");
    expect(c.texto).toContain("Calabresa");
    expect(c.texto).not.toContain("Portuguesa");
  });
});

describe("a situação da loja vem antes do cardápio", () => {
  it("loja fechada é avisada em destaque", async () => {
    const c = await montarCatalogo(bancoFalso(BASE, { ...LOJA, is_open: false }), "loja-1");
    expect(c.loja.aberta).toBe(false);
    expect(c.texto).toContain("FECHADA");
    // O aviso precisa vir antes da lista, senão a IA fecha o pedido e só
    // depois descobre que a cozinha está apagada.
    expect(c.texto.indexOf("FECHADA")).toBeLessThan(c.texto.indexOf("Calabresa"));
  });

  it("loja sem entrega avisa que é retirada", async () => {
    const c = await montarCatalogo(
      bancoFalso(BASE, { ...LOJA, delivery_enabled: false }),
      "loja-1",
    );
    expect(c.texto).toContain("NÃO faz entrega");
  });
});

describe("combos só entram quando estão mesmo no ar", () => {
  const quarta10h = new Date("2026-09-16T13:00:00Z"); // 10h em Brasília, quarta

  it("combo sem restrição entra", () => {
    expect(comboNoAr({ active: true }, quarta10h)).toBe(true);
  });

  it("combo de outro dia da semana fica de fora", () => {
    // Promoção de segunda anunciada na quarta é promessa que a cozinha não
    // cumpre. (3 = quarta)
    expect(comboNoAr({ active: true, available_days: [1] }, quarta10h)).toBe(false);
    expect(comboNoAr({ active: true, available_days: [3] }, quarta10h)).toBe(true);
  });

  it("combo fora do horário fica de fora", () => {
    expect(comboNoAr({ active: true, start_time: "18:00", end_time: "23:00" }, quarta10h)).toBe(
      false,
    );
    expect(comboNoAr({ active: true, start_time: "08:00", end_time: "12:00" }, quarta10h)).toBe(
      true,
    );
  });

  it("faixa que vira a noite funciona", () => {
    // 22:00 às 02:00 é uma faixa só, não duas.
    const umaDaManha = new Date("2026-09-16T04:00:00Z");
    expect(comboNoAr({ active: true, start_time: "22:00", end_time: "02:00" }, umaDaManha)).toBe(
      true,
    );
    expect(comboNoAr({ active: true, start_time: "22:00", end_time: "02:00" }, quarta10h)).toBe(
      false,
    );
  });

  it("combo com data já vencida fica de fora", () => {
    expect(comboNoAr({ active: true, ends_at: "2026-01-01T00:00:00Z" }, quarta10h)).toBe(false);
  });

  it("combo desativado nunca entra", () => {
    expect(comboNoAr({ active: false }, quarta10h)).toBe(false);
  });
});

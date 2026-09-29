import { describe, expect, it } from "vitest";
import { parseMenuImport } from "./importSchema";
import { buildImportPlan, normalizeKey, planTotals, type ExistingMenu } from "./importPlan";
import { mensagemFinal, runImport, type ImportDeps } from "./importRunner";

// O arquivo real do teste pedido pelo dono.
const CASO_REAL = `{
  "categorias": [
    {
      "nome": "Marmitas Especiais",
      "descricao": "Valor promocional para pagamento em dinheiro ou PIX.",
      "itens": [
        { "nome": "Fritada de Calabresa", "descricao": "Calabresa e ovo", "preco": 9.99 },
        { "nome": "Mix de Frango com Toscana", "descricao": "Frango com linguiça toscana", "preco": 9.99 },
        { "nome": "Macarrão com Salsicha ao Molho", "descricao": "Macarrão com salsicha ao molho", "preco": 9.99 }
      ]
    },
    {
      "nome": "Açaí Especial",
      "itens": [
        { "nome": "Açaí com Creme de Ninho 270ml", "preco": 8.49 },
        { "nome": "Açaí com Creme de Ninho 400ml", "preco": 12.49 },
        { "nome": "Açaí com Creme de Cupuaçu 270ml", "preco": 8.49 },
        { "nome": "Açaí com Creme de Cupuaçu 400ml", "preco": 12.49 }
      ]
    }
  ],
  "bebidas": [
    { "nome": "Suco de Cupuaçu 300ml", "preco": 4.49 },
    { "nome": "Suco de Maracujá 300ml", "preco": 4.49 },
    { "nome": "Suco de Jenipapo 300ml", "preco": 4.49 }
  ],
  "bordas": [],
  "adicionais": []
}`;

const VAZIO: ExistingMenu = { categories: [], products: [], extras: [] };

function parse(text: string) {
  const r = parseMenuImport(text);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.data;
}

/** Caderno de mentira: guarda o que seria gravado e devolve ids em sequência. */
function fakeDeps(overrides: Partial<ImportDeps> = {}) {
  const categories: { id: string; nome: string; orderIndex: number }[] = [];
  const products: {
    nome: string;
    preco: number;
    descricao?: string;
    categoryId: string;
    type: string;
  }[] = [];
  const deps: ImportDeps = {
    async createCategory({ nome, orderIndex }) {
      const id = `cat-${categories.length + 1}`;
      categories.push({ id, nome, orderIndex });
      return { ok: true, id, externalId: `ext-${id}` };
    },
    async createProduct({ item, categoryId, productType }) {
      products.push({
        nome: item.nome,
        preco: item.preco,
        descricao: item.descricao,
        categoryId,
        type: productType,
      });
      return { ok: true };
    },
    async createExtra() {
      return { ok: true };
    },
    ...overrides,
  };
  return { deps, categories, products };
}

describe("normalizeKey", () => {
  it("trata Bebidas, ' bebidas ' e BEBIDAS como o mesmo nome", () => {
    expect(normalizeKey("Bebidas")).toBe(normalizeKey(" bebidas "));
    expect(normalizeKey("BEBIDAS")).toBe(normalizeKey("Bebidas"));
    expect(normalizeKey("Suco   de  Uva")).toBe("suco de uva");
  });
});

describe("importação do caso real", () => {
  it("cria 3 categorias e 10 produtos, cada um ligado à categoria certa", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), VAZIO);
    expect(planTotals(plan)).toMatchObject({
      categoriesToCreate: 3,
      productsToCreate: 10,
      productsSkipped: 0,
    });

    const { deps, categories, products } = fakeDeps();
    const report = await runImport(plan, deps);

    expect(report.failures).toEqual([]);
    expect(report.productsCreated).toBe(10);
    expect(mensagemFinal(report)).toBe("Importação concluída: 10 produtos adicionados.");
    expect(categories.map((c) => c.nome)).toEqual([
      "Marmitas Especiais",
      "Açaí Especial",
      "Bebidas",
    ]);

    const idDe = (nome: string) => categories.find((c) => c.nome === nome)!.id;
    const contar = (nome: string) => products.filter((p) => p.categoryId === idDe(nome)).length;
    expect(contar("Marmitas Especiais")).toBe(3);
    expect(contar("Açaí Especial")).toBe(4);
    expect(contar("Bebidas")).toBe(3);

    const fritada = products.find((p) => p.nome === "Fritada de Calabresa")!;
    expect(fritada).toMatchObject({ preco: 9.99, descricao: "Calabresa e ovo", type: "standard" });
    expect(products.filter((p) => p.type === "beverage")).toHaveLength(3);
  });

  it("continua a importar os outros itens quando um falha, e diz qual e por quê", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), VAZIO);
    const { deps, products } = fakeDeps({
      async createProduct({ item, categoryId, productType }) {
        if (item.nome === "Mix de Frango com Toscana") return { ok: false, why: "violates RLS" };
        products.push({ nome: item.nome, preco: item.preco, categoryId, type: productType });
        return { ok: true };
      },
    });
    const report = await runImport(plan, deps);

    expect(report.productsCreated).toBe(9);
    expect(report.failures).toEqual([
      {
        nome: "Mix de Frango com Toscana",
        mensagem: "Erro ao importar Mix de Frango com Toscana: violates RLS",
      },
    ]);
  });

  it("erro inesperado (exceção) também vira falha registrada, não some", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), VAZIO);
    const { deps } = fakeDeps({
      async createProduct() {
        throw new Error("rede caiu");
      },
    });
    const report = await runImport(plan, deps);
    expect(report.productsCreated).toBe(0);
    expect(report.failures).toHaveLength(10);
    expect(report.failures[0].mensagem).toContain("rede caiu");
  });

  it("item salvo mas recusado pelo site conta como criado e gera aviso", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), VAZIO);
    const { deps } = fakeDeps({
      async createProduct() {
        return { ok: true, warning: "coluna inexistente" };
      },
    });
    const report = await runImport(plan, deps);
    expect(report.productsCreated).toBe(10);
    expect(report.failures).toEqual([]);
    expect(report.warnings).toHaveLength(10);
  });

  it("categoria que não foi criada: os itens dela são listados como não importados", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), VAZIO);
    const { deps } = fakeDeps({
      async createCategory({ nome }) {
        if (nome === "Açaí Especial") return { ok: false, why: "site fora do ar" };
        return { ok: true, id: `id-${nome}`, externalId: null };
      },
    });
    const report = await runImport(plan, deps);
    expect(report.productsCreated).toBe(6);
    expect(report.failures.map((f) => f.nome)).toEqual([
      "Açaí Especial",
      "Açaí com Creme de Ninho 270ml",
      "Açaí com Creme de Ninho 400ml",
      "Açaí com Creme de Cupuaçu 270ml",
      "Açaí com Creme de Cupuaçu 400ml",
    ]);
  });
});

describe("anti-duplicação", () => {
  const existente: ExistingMenu = {
    categories: [
      { id: "c-beb", name: " bebidas ", external_id: "ext-beb", order_index: 4, active: true },
      {
        id: "c-marm",
        name: "MARMITAS ESPECIAIS",
        external_id: "ext-marm",
        order_index: 2,
        active: true,
      },
    ],
    products: [
      { name: "fritada de calabresa", category_id: "c-marm", product_type: "standard" },
      { name: "Suco de Cupuaçu 300ml", category_id: null, product_type: "beverage" },
    ],
    extras: [],
  };

  it("reaproveita categorias com nome equivalente e não cria itens que já existem", async () => {
    const plan = buildImportPlan(parse(CASO_REAL), existente);
    expect(planTotals(plan)).toMatchObject({
      categoriesToCreate: 1, // só "Açaí Especial"
      categoriesReused: 2,
      productsToCreate: 8,
      productsSkipped: 2,
    });
    expect(plan.nextOrderIndex).toBe(5);

    const { deps, categories, products } = fakeDeps();
    const report = await runImport(plan, deps);
    expect(categories.map((c) => c.nome)).toEqual(["Açaí Especial"]);
    expect(report.categoriesReused).toBe(2);
    expect(report.productsCreated).toBe(8);
    expect(report.productsSkipped).toBe(2);
    // Os itens novos de "Marmitas" entram na categoria que já existia.
    const marmitas = products.filter((p) => p.categoryId === "c-marm").map((p) => p.nome);
    expect(marmitas).toEqual(["Mix de Frango com Toscana", "Macarrão com Salsicha ao Molho"]);
    // As bebidas novas entram na categoria "Bebidas" que já existia.
    expect(products.filter((p) => p.categoryId === "c-beb")).toHaveLength(2);
  });

  it("importar duas vezes o mesmo arquivo não duplica nada", async () => {
    const primeira = buildImportPlan(parse(CASO_REAL), VAZIO);
    const { deps, categories, products } = fakeDeps();
    await runImport(primeira, deps);

    const agora: ExistingMenu = {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.nome,
        external_id: null,
        order_index: c.orderIndex,
        active: true,
      })),
      products: products.map((p) => ({
        name: p.nome,
        category_id: p.categoryId,
        product_type: p.type,
      })),
      extras: [],
    };
    const segunda = buildImportPlan(parse(CASO_REAL), agora);
    expect(planTotals(segunda)).toMatchObject({
      categoriesToCreate: 0,
      productsToCreate: 0,
      productsSkipped: 10,
    });
  });

  it("categoria 'Bebidas' escrita no arquivo e o bloco bebidas usam UMA categoria só", async () => {
    const menu = parse(
      JSON.stringify({
        categorias: [{ nome: "BEBIDAS", itens: [{ nome: "Água", preco: 3 }] }],
        bebidas: [{ nome: "Guaraná", preco: 6 }],
      }),
    );
    const { deps, categories } = fakeDeps();
    const report = await runImport(buildImportPlan(menu, VAZIO), deps);
    expect(categories).toHaveLength(1);
    expect(report.productsCreated).toBe(2);
  });

  it("item repetido dentro do próprio arquivo entra uma vez só", () => {
    const menu = parse(
      JSON.stringify({
        categorias: [
          {
            nome: "Lanches",
            itens: [
              { nome: "X-Burguer", preco: 20 },
              { nome: " x-burguer ", preco: 20 },
            ],
          },
        ],
      }),
    );
    expect(planTotals(buildImportPlan(menu, VAZIO))).toMatchObject({
      productsToCreate: 1,
      productsSkipped: 1,
    });
  });

  it("avisa quando a categoria existente está desativada", () => {
    const plan = buildImportPlan(parse(CASO_REAL), {
      ...VAZIO,
      categories: [
        { id: "x", name: "Açaí Especial", external_id: null, order_index: 0, active: false },
      ],
    });
    expect(planTotals(plan).inactiveCategories).toEqual(["Açaí Especial"]);
  });
});

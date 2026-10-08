import { describe, expect, it } from "vitest";
import {
  INSTRUCAO_PARA_IA,
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
    expect(result.data.categorias[0].itens[0].imagem).toMatch(/^https:\/\//);
    expect(result.avisos).toEqual([]);
  });

  it("a estrutura da instrução para IA também é aceita como está", () => {
    // O ChatGPT devolve a estrutura preenchida. Se a própria estrutura que
    // mandamos não passasse, a culpa seria nossa, não dele.
    const inicio = INSTRUCAO_PARA_IA.indexOf("{");
    const fim = INSTRUCAO_PARA_IA.lastIndexOf("}");
    const estrutura = INSTRUCAO_PARA_IA.slice(inicio, fim + 1)
      .replace(/"nome": ""/g, '"nome": "Item"')
      .replace(/"preco": 0/g, '"preco": 10');
    const result = parseMenuImport(estrutura);
    expect(result.ok).toBe(true);
  });
});

describe("arquivo montado pelo ChatGPT ou colado do WhatsApp", () => {
  const umItem = (chaveDosItens: string, chaveDoPreco = "preco") =>
    `{ "categorias": [ { "nome": "Açaí", "${chaveDosItens}": [ { "nome": "Açaí 300ml", "${chaveDoPreco}": 15 } ] } ] }`;

  it('"produtos" no lugar de "itens" NÃO cria a categoria vazia', () => {
    // O defeito que motivou esta revisão: a categoria passava como válida e
    // era criada sem nenhum produto, sem aviso nenhum.
    const result = parseMenuImport(umItem("produtos"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categorias[0].itens).toHaveLength(1);
  });

  it('entende "preço" com cedilha e os campos em inglês', () => {
    const comCedilha = parseMenuImport(umItem("itens", "preço"));
    expect(comCedilha.ok).toBe(true);

    const emIngles = parseMenuImport(
      '{ "categories": [ { "name": "Açaí", "items": [ { "name": "Açaí 300ml", "price": 15 } ] } ] }',
    );
    expect(emIngles.ok).toBe(true);
    if (!emIngles.ok) return;
    expect(emIngles.data.categorias[0].itens[0]).toMatchObject({ nome: "Açaí 300ml", preco: 15 });
  });

  it("campo que não reconhece vira erro, nunca é jogado fora calado", () => {
    const result = parseMenuImport(
      '{ "bebidas": [ { "nome": "Coca", "preco": 12, "tamanho": "2L" } ] }',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('"tamanho"');
    expect(result.errors[0]).toMatch(/perdido/);
  });

  it("tira o ```json que o ChatGPT coloca em volta, e avisa", () => {
    const result = parseMenuImport("Aqui está:\n```json\n" + umItem("itens") + "\n```");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categorias[0].itens).toHaveLength(1);
    expect(result.avisos.join(" ")).toMatch(/antes ou depois do JSON/);
  });

  it("conserta vírgula sobrando e aspas curvas, e avisa", () => {
    const virgula = parseMenuImport('{ "bebidas": [ { "nome": "Coca", "preco": 12 }, ] }');
    expect(virgula.ok).toBe(true);
    if (virgula.ok) expect(virgula.avisos.join(" ")).toMatch(/vírgulas sobrando/);

    const curvas = parseMenuImport("{ “bebidas”: [ { “nome”: “Coca”, “preco”: 12 } ] }");
    expect(curvas.ok).toBe(true);
    if (curvas.ok) expect(curvas.avisos.join(" ")).toMatch(/aspas curvas/);
  });

  it("aspas curvas DENTRO de um nome ficam como estão", () => {
    const result = parseMenuImport('{ "bebidas": [ { "nome": "Suco “da casa”", "preco": 9 } ] }');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bebidas[0].nome).toBe("Suco “da casa”");
    expect(result.avisos).toEqual([]);
  });

  it("JSON quebrado de verdade aponta a linha do problema", () => {
    const result = parseMenuImport(
      '{\n  "categorias": [\n    { "nome": "Açaí" "itens": [] }\n  ]\n}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/linha 3/);
  });
});

describe("foto, repetidos e preço zero", () => {
  it("aceita foto com https e recusa nome de arquivo solto", () => {
    const boa = parseMenuImport(
      '{ "bebidas": [ { "nome": "Coca", "preco": 12, "imagem": "https://x.com/coca.jpg" } ] }',
    );
    expect(boa.ok).toBe(true);
    if (boa.ok) expect(boa.data.bebidas[0].imagem).toBe("https://x.com/coca.jpg");

    const ruim = parseMenuImport(
      '{ "bebidas": [ { "nome": "Coca", "preco": 12, "foto": "coca.jpg" } ] }',
    );
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(ruim.errors[0]).toMatch(/https:\/\//);
  });

  it("foto vazia é o mesmo que sem foto", () => {
    const result = parseMenuImport(
      '{ "bebidas": [ { "nome": "Coca", "preco": 12, "imagem": "" } ] }',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.bebidas[0].imagem).toBeUndefined();
  });

  it("recusa item repetido na mesma lista, mesmo escrito diferente", () => {
    const result = parseMenuImport(
      '{ "bebidas": [ { "nome": "Coca-Cola 2L", "preco": 12 }, { "nome": "coca cola 2l", "preco": 12 } ] }',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/mais de uma vez/);
  });

  it("produto com preço zero passa, mas com aviso de que sai de graça", () => {
    const result = parseMenuImport(umProdutoZerado());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.avisos.join(" ")).toMatch(/de graça/);
  });

  it("adicional sem custo não gera aviso — é comum de propósito", () => {
    const result = parseMenuImport('{ "adicionais": [ { "nome": "Granola", "preco": 0 } ] }');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.avisos).toEqual([]);
  });
});

function umProdutoZerado() {
  return '{ "categorias": [ { "nome": "Açaí", "itens": [ { "nome": "Açaí 300ml", "preco": 0 } ] } ] }';
}

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
    // A posição é dita em português, contando a partir de 1 e com o nome —
    // "categorias[0].itens[1]" é linguagem de programador.
    expect(result.errors[0]).toContain('Categoria 1 ("Pizzas"), item 1 ("Calabresa")');
    expect(result.errors[0]).toMatch(/preco/);
    expect(result.errors[1]).toContain('Categoria 1 ("Pizzas"), item 2');
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

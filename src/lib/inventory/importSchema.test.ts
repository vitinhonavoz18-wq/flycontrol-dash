import { describe, expect, it } from "vitest";
import {
  MODELO_COMPLETO,
  MODELO_SIMPLES,
  chaveDeComparacao,
  formatarJson,
  lerImportacaoDeProdutos,
} from "./importSchema";

const json = (o: unknown) => JSON.stringify(o);

describe("o arquivo inteiro", () => {
  it("aceita o modelo simples que a tela oferece", () => {
    // Se o modelo mostrado na tela não passasse na própria conferência, o
    // lojista copiaria, colaria e levaria erro — o pior primeiro contato
    // possível com a funcionalidade.
    const r = lerImportacaoDeProdutos(MODELO_SIMPLES);
    expect(r.erroGeral).toBeNull();
    expect(r.produtos).toHaveLength(2);
  });

  it("aceita o modelo completo, com embalagens", () => {
    const r = lerImportacaoDeProdutos(MODELO_COMPLETO);
    expect(r.erroGeral).toBeNull();
    expect(r.produtos[0].embalagens).toHaveLength(1);
    expect(r.produtos[0].embalagens[0].quantidade).toBe(6);
  });

  it("texto vazio pede o JSON em vez de dar erro técnico", () => {
    expect(lerImportacaoDeProdutos("").erroGeral).toContain("Cole o JSON");
  });

  it("JSON quebrado aponta a linha do problema", () => {
    // "Unexpected token" não ajuda ninguém a achar o erro num arquivo grande.
    const quebrado = '{\n  "produtos": [\n    { "nome": "A" }\n    { "nome": "B" }\n  ]\n}';
    const r = lerImportacaoDeProdutos(quebrado);
    expect(r.erroGeral).toMatch(/linha \d+/);
  });

  it("sem o campo produtos, diz exatamente o que falta", () => {
    const r = lerImportacaoDeProdutos(json({ itens: [] }));
    expect(r.erroGeral).toContain('"produtos"');
  });

  it("produtos que não é lista é recusado", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: { nome: "X" } }));
    expect(r.erroGeral).toContain("precisa ser uma lista");
  });

  it("lista vazia avisa em vez de importar nada em silêncio", () => {
    expect(lerImportacaoDeProdutos(json({ produtos: [] })).erroGeral).toContain("vazia");
  });

  it("acima do limite, recusa antes de tentar", () => {
    const muitos = Array.from({ length: 1001 }, (_, i) => ({ nome: `P${i}` }));
    const r = lerImportacaoDeProdutos(json({ produtos: muitos }));
    expect(r.erroGeral).toContain("1000");
  });
});

describe("cada produto", () => {
  it("só o nome é obrigatório — o resto ganha padrão seguro", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "Água 500ml" }] }));
    const p = r.produtos[0];
    expect(p.nome).toBe("Água 500ml");
    expect(p.ativo).toBe(true);
    expect(p.unidadeBase).toBe("unidade");
    expect(p.estoqueMinimo).toBe(0);
    expect(p.quantidadeEstoque).toBe(0);
    // Preço NÃO é inventado: fica zero e o lojista preenche depois.
    expect(p.precoVendaCents).toBe(0);
  });

  it("produto sem nome vira erro apontando a posição", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "A" }, { sku: "X" }] }));
    expect(r.produtos).toHaveLength(1);
    expect(r.erros[0].posicao).toBe(2);
    expect(r.erros[0].mensagem).toContain("nome");
  });

  it("um produto com erro não derruba os outros", () => {
    // Devolver o arquivo inteiro por causa de uma linha seria recusar a carga
    // toda porque uma caixa veio amassada.
    const r = lerImportacaoDeProdutos(
      json({
        produtos: [{ nome: "Bom" }, { nome: "Ruim", preco_venda: "abacaxi" }, { nome: "Outro" }],
      }),
    );
    expect(r.produtos.map((p) => p.nome)).toEqual(["Bom", "Outro"]);
    expect(r.erros).toHaveLength(1);
  });

  it("preço com vírgula é aceito, como se escreve no Brasil", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "X", preco_venda: "10,90" }] }));
    expect(r.produtos[0].precoVendaCents).toBe(1090);
  });

  it("preço com R$ também é aceito", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "X", preco_venda: "R$ 12,50" }] }));
    expect(r.produtos[0].precoVendaCents).toBe(1250);
  });

  it("número quebrado no preço vira erro claro, não NaN", () => {
    const r = lerImportacaoDeProdutos(
      json({ produtos: [{ nome: "X", preco_venda: "dez reais" }] }),
    );
    expect(r.produtos).toHaveLength(0);
    expect(r.erros[0].mensagem).toContain("preco_venda");
  });

  it("valor negativo é recusado", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "X", quantidade_estoque: -5 }] }));
    expect(r.erros[0].mensagem).toContain("negativo");
  });

  it("estoque zero é válido — produto pode nascer sem mercadoria", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "X", quantidade_estoque: 0 }] }));
    expect(r.erros).toHaveLength(0);
    expect(r.produtos[0].quantidadeEstoque).toBe(0);
  });

  it("espaços em volta do nome são aparados", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "  Coca   Cola 2L  " }] }));
    expect(r.produtos[0].nome).toBe("Coca Cola 2L");
  });
});

describe("embalagens (caixa e unidade)", () => {
  it("a variação de 1 unidade não vira embalagem — ela é a régua", () => {
    const r = lerImportacaoDeProdutos(
      json({
        produtos: [
          {
            nome: "Coca lata",
            variacoes: [
              { nome: "Unidade", tipo: "unidade", quantidade_por_embalagem: 1, preco_venda: 5 },
              {
                nome: "Caixa com 12",
                tipo: "caixa",
                quantidade_por_embalagem: 12,
                preco_venda: 55,
              },
            ],
          },
        ],
      }),
    );
    expect(r.produtos[0].embalagens).toHaveLength(1);
    expect(r.produtos[0].embalagens[0].unidade).toBe("caixa");
    expect(r.produtos[0].embalagens[0].quantidade).toBe(12);
    expect(r.produtos[0].embalagens[0].precoCents).toBe(5500);
  });

  it("a variação de 1 unidade empresta o preço quando o produto não trouxe", () => {
    const r = lerImportacaoDeProdutos(
      json({
        produtos: [
          {
            nome: "Coca lata",
            variacoes: [{ tipo: "unidade", quantidade_por_embalagem: 1, preco_venda: 5 }],
          },
        ],
      }),
    );
    expect(r.produtos[0].precoVendaCents).toBe(500);
  });

  it("o preço do produto ganha do preço da variação unitária", () => {
    const r = lerImportacaoDeProdutos(
      json({
        produtos: [
          {
            nome: "Coca lata",
            preco_venda: 6,
            variacoes: [{ tipo: "unidade", quantidade_por_embalagem: 1, preco_venda: 5 }],
          },
        ],
      }),
    );
    expect(r.produtos[0].precoVendaCents).toBe(600);
  });

  it("embalagem sem quantidade é recusada", () => {
    // Sem saber quantas unidades cabem, o saldo não teria como fechar: dar
    // entrada em "10 caixas" viraria um número sem significado.
    const r = lerImportacaoDeProdutos(
      json({ produtos: [{ nome: "X", variacoes: [{ tipo: "caixa", preco_venda: 50 }] }] }),
    );
    expect(r.erros[0].mensagem).toContain("quantidade_por_embalagem");
  });

  it("duas embalagens com o mesmo nome no mesmo produto são recusadas", () => {
    const r = lerImportacaoDeProdutos(
      json({
        produtos: [
          {
            nome: "X",
            variacoes: [
              { tipo: "caixa", quantidade_por_embalagem: 6 },
              { tipo: "Caixa", quantidade_por_embalagem: 12 },
            ],
          },
        ],
      }),
    );
    expect(r.erros[0].mensagem).toContain("duas embalagens");
  });

  it("variacoes que não é lista vira erro claro", () => {
    const r = lerImportacaoDeProdutos(json({ produtos: [{ nome: "X", variacoes: "caixa" }] }));
    expect(r.erros[0].mensagem).toContain("lista");
  });
});

describe("repetido dentro do próprio arquivo", () => {
  it("o mesmo produto duas vezes no arquivo entra só uma", () => {
    const r = lerImportacaoDeProdutos(
      json({ produtos: [{ nome: "Coca-Cola 2L" }, { nome: "coca cola 2L" }] }),
    );
    expect(r.produtos).toHaveLength(1);
    expect(r.erros[0].mensagem).toContain("posição 1");
  });
});

describe("comparação de nomes", () => {
  it("ignora maiúsculas, acentos e pontuação", () => {
    expect(chaveDeComparacao("Coca-Cola 2L")).toBe("coca-cola-2l");
    expect(chaveDeComparacao("  COCA   COLA 2L ")).toBe("coca-cola-2l");
    expect(chaveDeComparacao("Açaí 500ml")).toBe("acai-500ml");
  });

  it("nomes diferentes continuam diferentes", () => {
    expect(chaveDeComparacao("Coca-Cola 2L")).not.toBe(chaveDeComparacao("Coca-Cola 1L"));
  });
});

describe("formatar", () => {
  it("organiza o JSON bagunçado", () => {
    const r = formatarJson('{"produtos":[{"nome":"X"}]}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toContain("\n  ");
  });

  it("explica quando não dá para formatar", () => {
    const r = formatarJson("{ isso não é json");
    expect(r.ok).toBe(false);
  });
});

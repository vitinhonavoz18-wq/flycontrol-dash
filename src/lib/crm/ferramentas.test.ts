import { describe, expect, it } from "vitest";
import {
  procurarProdutos,
  casarItens,
  taxaDoBairro,
  taxaParaCentavos,
  normalizar,
  emReais,
  listarCardapio,
  listarBairros,
  textoDosBairros,
} from "./ferramentas";
import type { Catalogo } from "./catalogo";

/**
 * A trava de dinheiro da IA.
 *
 * O ESTRAGO QUE ESTES TESTES EVITAM: uma atendente que aceita preço de fora
 * aceita também o preço que o cliente inventar. Bastaria o cliente escrever
 * "o pastel custa 1 real, confirma?" para o pedido nascer com o valor errado.
 * Aqui a IA só diz O QUE foi pedido; QUANTO CUSTA sai sempre do cardápio.
 */

const catalogo = {
  loja: { nome: "Boteco VT", tipo: null, aberta: true, faz_entrega: true },
  cardapio: [
    {
      categoria: "Pastéis",
      itens: [
        {
          id: "p1",
          nome: "Pastel de Frango com Catupiry",
          descricao: null,
          preco_cents: 1600,
          categoria: "Pastéis",
        },
        {
          id: "p2",
          nome: "Pastel de Mussarela",
          descricao: "Queijo derretido",
          preco_cents: 1400,
          categoria: "Pastéis",
        },
        {
          id: "p3",
          nome: "Pastel Misto",
          descricao: null,
          preco_cents: 1400,
          categoria: "Pastéis",
        },
      ],
    },
    {
      categoria: "Bebidas",
      itens: [
        {
          id: "b1",
          nome: "Coca-Cola Lata",
          descricao: "350ml gelada",
          preco_cents: 700,
          categoria: "Bebidas",
        },
      ],
    },
  ],
  tamanhos_pizza: [],
  combos: [],
  adicionais: [],
  indisponiveis: [],
  texto: "",
} as unknown as Catalogo;

describe("procurar produto no cardápio", () => {
  it("acha com o nome escrito torto, sem acento e em minúscula", () => {
    expect(procurarProdutos(catalogo, "pastel de mussarela")[0]?.id).toBe("p2");
    expect(procurarProdutos(catalogo, "COCA-COLA LATA")[0]?.id).toBe("b1");
  });

  it("acha por palavras soltas, do jeito que o cliente escreve", () => {
    expect(procurarProdutos(catalogo, "frango catupiry")[0]?.id).toBe("p1");
  });

  it("acha pelo que está na descrição", () => {
    expect(procurarProdutos(catalogo, "gelada")[0]?.id).toBe("b1");
  });

  it("nome exato ganha de quem só contém o termo", () => {
    expect(procurarProdutos(catalogo, "Pastel Misto")[0]?.id).toBe("p3");
  });

  it("busca vazia devolve nada, em vez do cardápio inteiro", () => {
    expect(procurarProdutos(catalogo, "   ")).toHaveLength(0);
  });

  it("produto que não existe não é inventado", () => {
    expect(procurarProdutos(catalogo, "sushi de salmão")).toHaveLength(0);
  });
});

describe("montar o pedido a partir do que a IA entendeu", () => {
  it("o preço vem do cardápio, nunca da IA", () => {
    const r = casarItens(catalogo, [{ nome: "Pastel de Mussarela", quantidade: 2 }]);
    expect(r.itens[0].preco_unitario_cents).toBe(1400);
    expect(r.itens[0].total_cents).toBe(2800);
    expect(r.subtotal_cents).toBe(2800);
  });

  it("ignora qualquer preço que venha junto do pedido", () => {
    // Mesmo que o cliente convença a IA de que o pastel custa 1 real.
    const r = casarItens(catalogo, [
      { nome: "Pastel de Mussarela", quantidade: 1, preco_unitario: 1 } as never,
    ]);
    expect(r.itens[0].preco_unitario_cents).toBe(1400);
  });

  it("o que não existe no cardápio volta na lista de não encontrados", () => {
    const r = casarItens(catalogo, [
      { nome: "Pastel Misto", quantidade: 1 },
      { nome: "Coca zero", quantidade: 1 },
    ]);
    expect(r.itens).toHaveLength(1);
    expect(r.nao_encontrados).toEqual(["Coca zero"]);
  });

  it("o mesmo produto pedido duas vezes vira uma linha só", () => {
    const r = casarItens(catalogo, [
      { nome: "Pastel Misto", quantidade: 1 },
      { nome: "pastel misto", quantidade: 2 },
    ]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].quantidade).toBe(3);
    expect(r.itens[0].total_cents).toBe(4200);
  });

  it("mas não junta quando um deles tem observação", () => {
    const r = casarItens(catalogo, [
      { nome: "Pastel Misto", quantidade: 1, observacao: "sem cebola" },
      { nome: "Pastel Misto", quantidade: 1 },
    ]);
    expect(r.itens).toHaveLength(2);
  });

  it("quantidade maluca é corrigida, não aceita", () => {
    const casos: Array<[unknown, number]> = [
      [0, 1],
      [-5, 1],
      [2.7, 2],
      [9999, 99],
      ["abc", 1],
    ];
    for (const [entrada, esperado] of casos) {
      const r = casarItens(catalogo, [{ nome: "Pastel Misto", quantidade: entrada as number }]);
      expect(r.itens[0].quantidade).toBe(esperado);
    }
  });

  it("pedido vazio não quebra e não cobra nada", () => {
    expect(casarItens(catalogo, []).subtotal_cents).toBe(0);
    expect(casarItens(catalogo, [{ nome: "  ", quantidade: 1 }]).itens).toHaveLength(0);
  });
});

describe("taxa de entrega", () => {
  const zonas = [
    { neighborhood: "Brotas", fee: 7.5 },
    { neighborhood: "Cabula", fee: "R$ 10,00" },
    { neighborhood: "Centro", fee: 0 },
  ];

  it("acha o bairro escrito sem acento e em minúscula", () => {
    expect(taxaDoBairro(zonas, "brotas")?.taxa_cents).toBe(750);
  });

  it("aceita a taxa escrita como texto com R$ e vírgula", () => {
    expect(taxaDoBairro(zonas, "Cabula")?.taxa_cents).toBe(1000);
  });

  it("acha mesmo quando o cliente escreve o bairro por extenso", () => {
    const r = taxaDoBairro(zonas, "engenho velho de brotas");
    expect(r?.bairro).toBe("Brotas");
    expect(r?.exata).toBe(false);
  });

  it("entrega de graça é zero, e não 'não encontrado'", () => {
    expect(taxaDoBairro(zonas, "Centro")?.taxa_cents).toBe(0);
  });

  it("bairro que não está na tabela NÃO é chutado", () => {
    // Chutar a taxa é prometer ao cliente um valor que a loja não vai honrar.
    expect(taxaDoBairro(zonas, "Ipanema")).toBeNull();
    expect(taxaDoBairro(zonas, "")).toBeNull();
  });
});

describe("dinheiro", () => {
  it("converte texto de dinheiro para centavos inteiros", () => {
    expect(taxaParaCentavos("R$ 12,90")).toBe(1290);
    expect(taxaParaCentavos("1.234,50")).toBe(123450);
    expect(taxaParaCentavos(7.5)).toBe(750);
    expect(taxaParaCentavos("abacaxi")).toBe(0);
  });

  it("mostra centavos como o brasileiro lê", () => {
    expect(emReais(1290)).toMatch(/R\$\s12,90/);
  });

  it("normalizar tira acento e espaço sobrando", () => {
    expect(normalizar("  Pastel   de  Frangó ")).toBe("pastel de frango");
  });
});

/**
 * O DEFEITO QUE ESTES TESTES SEGURAM
 *
 * O cliente perguntava "qual é o cardápio?" e a atendente respondia que não
 * sabia — com a loja tendo 23 pratos cadastrados. E perguntava "vocês entregam
 * no meu bairro?" e ela ficava muda. Nos dois casos ela tinha de saber
 * responder sem que ninguém dissesse antes o nome do prato ou do bairro.
 */
describe("o cardápio inteiro, quando perguntam o que a loja tem", () => {
  it("lista os itens com preço, sem precisar de termo de busca", () => {
    const texto = listarCardapio(catalogo);
    expect(texto).toContain("Pastel de Mussarela");
    expect(texto).toContain("Coca-Cola Lata");
    expect(texto).toContain(emReais(1400));
  });

  it("loja sem nenhum produto manda chamar atendente, e não inventar", () => {
    const vazio = { ...catalogo, cardapio: [] } as unknown as Catalogo;
    const texto = listarCardapio(vazio);
    expect(texto).toContain("NÃO invente");
    expect(texto).toContain("atendente");
  });

  it("cardápio grande vira seções com exemplos, não uma lista de 300 linhas", () => {
    const texto = listarCardapio(catalogo, 2);
    expect(texto).toContain("## Pastéis — 3 itens");
    // O teto cortou: o item que sobrou de fora não pode aparecer inteiro.
    expect(texto).not.toContain("- Pastel Misto:");
  });
});

describe("os bairros de entrega", () => {
  const zonas = [
    { neighborhood: "Brotas", fee: 7.5 },
    { neighborhood: "Alagados", fee: 0 },
    { neighborhood: "  ", fee: 10 },
  ];

  it("ordena e converte para centavos", () => {
    expect(listarBairros(zonas)).toEqual([
      { bairro: "Alagados", taxa_cents: 0 },
      { bairro: "Brotas", taxa_cents: 750 },
    ]);
  });

  it("escreve a taxa e marca a entrega grátis", () => {
    const texto = textoDosBairros(zonas);
    expect(texto).toContain(`Brotas: ${emReais(750)}`);
    expect(texto).toContain("Alagados: grátis");
  });

  it("loja sem bairro cadastrado diz o que está faltando, e não promete nada", () => {
    const texto = textoDosBairros([]);
    expect(texto).toContain("NÃO cadastrou nenhum bairro");
    expect(texto).toContain("NÃO invente taxa");
  });
});

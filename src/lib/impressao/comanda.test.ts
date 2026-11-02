import { describe, expect, it } from "vitest";
import {
  type Linha,
  dadosDoPedido,
  itemDoPedido,
  montarComanda,
  montarComandaDaMesa,
} from "./comanda";
import { LOJA_DE_EXEMPLO, PEDIDO_DE_EXEMPLO } from "./exemplos";

const AGORA = new Date("2026-11-01T23:40:00.000Z");
const FUSO = "America/Sao_Paulo";

function comanda(pedido: unknown, colunas: number, extra: { acentos?: boolean } = {}): Linha[] {
  return montarComanda(dadosDoPedido(pedido, LOJA_DE_EXEMPLO), {
    colunas,
    acentos: extra.acentos ?? true,
    fusoHorario: FUSO,
    agora: AGORA,
    linhasNoFinal: 3,
  });
}

const texto = (linhas: Linha[]) => linhas.map((l) => l.texto).join("\n");

function semEstourar(linhas: Linha[], colunas: number) {
  for (const l of linhas) {
    expect(l.texto.length, `linha larga demais: "${l.texto}"`).toBeLessThanOrEqual(colunas);
    expect(l.texto).not.toMatch(/[\r\n\t]/);
  }
}

describe("larguras de papel", () => {
  it("58 mm (32 letras): nada passa da largura", () => {
    const l = comanda(PEDIDO_DE_EXEMPLO, 32);
    semEstourar(l, 32);
    expect(l.some((x) => x.texto === "=".repeat(32))).toBe(true);
  });

  it("80 mm (48 letras): nada passa da largura", () => {
    const l = comanda(PEDIDO_DE_EXEMPLO, 48);
    semEstourar(l, 48);
    expect(l.some((x) => x.texto === "=".repeat(48))).toBe(true);
  });

  it("qualquer largura entre 24 e 80 letras", () => {
    for (let n = 24; n <= 80; n += 4) semEstourar(comanda(PEDIDO_DE_EXEMPLO, n), n);
  });

  it("largura fora do limite é trazida para dentro", () => {
    semEstourar(comanda(PEDIDO_DE_EXEMPLO, 5), 24);
    semEstourar(comanda(PEDIDO_DE_EXEMPLO, 500), 80);
  });
});

describe("conteúdo difícil", () => {
  it("nome de produto longo quebra e o preço fica na primeira linha", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      items: [
        {
          name: "Pizza Gigante Meio a Meio Calabresa Acebolada e Frango com Catupiry Original",
          quantity: 1,
          unit_price: 89.9,
        },
      ],
    };
    const l = comanda(pedido, 32);
    semEstourar(l, 32);
    const inicio = l.findIndex((x) => x.texto.startsWith("1x PIZZA GIGANTE"));
    expect(inicio).toBeGreaterThan(-1);
    expect(l[inicio].texto.endsWith("R$ 89,90")).toBe(true);
    // As linhas de continuação do nome ficam recuadas, embaixo do nome.
    expect(l[inicio + 1].texto.startsWith("   ")).toBe(true);
  });

  it("observação de várias linhas mantém cada linha e ganha destaque", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      items: [
        {
          name: "X-Burger",
          quantity: 1,
          unit_price: 20,
          notes: "sem cebola\nsem tomate\r\nponto da carne: mal passada",
        },
      ],
    };
    const l = comanda(pedido, 32);
    const destaque = l.filter((x) => x.estilo === "destaque").map((x) => x.texto.trim());
    expect(destaque).toContain("*** OBSERVAÇÃO ***");
    expect(destaque).toContain("sem cebola");
    expect(destaque).toContain("sem tomate");
    expect(destaque.some((t) => t.startsWith("ponto da carne"))).toBe(true);
  });

  it("pedido com muitos itens: todos aparecem, na ordem", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Produto ${i + 1}`,
      quantity: (i % 3) + 1,
      unit_price: 5,
    }));
    const l = comanda({ ...PEDIDO_DE_EXEMPLO, items }, 32);
    semEstourar(l, 32);
    const nomes = l.filter((x) => /^\d+x PRODUTO \d+/.test(x.texto)).map((x) => x.texto);
    expect(nomes).toHaveLength(40);
    expect(nomes[0]).toMatch(/^1x PRODUTO 1 /);
    expect(nomes[39]).toMatch(/^1x PRODUTO 40 /);
  });

  it("complementos: tamanho, sabores, borda, adicionais e ingredientes", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      items: [
        {
          name: "Pizza",
          quantity: 1,
          unit_price: 50,
          size: "Família",
          flavors: ["Calabresa", "Portuguesa"],
          crust: "Catupiry",
          ingredients: ["queijo", "presunto"],
          additions: [{ name: "Bacon" }, "Cheddar"],
        },
      ],
    };
    const t = texto(comanda(pedido, 48));
    expect(t).toContain("Tamanho: Família");
    expect(t).toContain("Sabores:");
    expect(t).toContain("- Calabresa");
    expect(t).toContain("- Portuguesa");
    expect(t).toContain("Borda: Catupiry");
    expect(t).toContain("+ Adicional: Bacon");
    expect(t).toContain("+ Adicional: Cheddar");
    expect(t).toContain("Ingredientes: queijo, presunto");
  });

  it("adicionais escritos dentro do texto do item (formato do site) não se repetem", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      items: [
        {
          name: "Açaí 500ml",
          quantity: 1,
          unit_price: 18,
          notes: "Bem gelado • Adicionais (+R$4,00): Leite Ninho, Granola",
        },
      ],
    };
    const t = texto(comanda(pedido, 48));
    expect(t).toContain("+ Adicional: Leite Ninho");
    expect(t).toContain("+ Adicional: Granola");
    expect(t).toContain("Bem gelado");
    expect(t).not.toContain("Adicionais (+R$");
  });

  it("pizza do configurador: frações, borda, 'sem' e observação, sem repetir a descrição", () => {
    const descricao =
      "PIZZA GRANDE\n• Calabresa: 1/2 (50%)\n• Mussarela: 1/2 (50%)\n• Borda: Cheddar\n• Sem: cebola\n• Observação: bem assada";
    const item = {
      name: "Pizza Grande",
      quantity: 1,
      unit_price: 60,
      notes: descricao,
      pizza: {
        versao: 1,
        tamanho: "Grande",
        fatias: 8,
        sabores: [
          {
            id: "1",
            nome: "Calabresa",
            fracao: "1/2",
            partes: 1,
            percentual: 50,
            preco_no_tamanho_centavos: 5000,
          },
          {
            id: "2",
            nome: "Mussarela",
            fracao: "1/2",
            partes: 1,
            percentual: 50,
            preco_no_tamanho_centavos: 5000,
          },
        ],
        regra: "maior",
        regra_aplicada: "maior",
        preco_sabores_centavos: 5000,
        borda: { id: "b", nome: "Cheddar", preco_centavos: 1000 },
        adicionais: [
          { id: "a", nome: "Bacon", quantidade: 2, preco_unitario_centavos: 0, total_centavos: 0 },
        ],
        removidos: ["cebola"],
        observacao: "bem assada",
        preco_unitario_centavos: 6000,
        quantidade: 1,
        total_centavos: 6000,
        descricao,
      },
    };
    const t = texto(comanda({ ...PEDIDO_DE_EXEMPLO, items: [item] }, 32));
    expect(t).toContain("- 1/2 Calabresa");
    expect(t).toContain("- 1/2 Mussarela");
    expect(t).toContain("Borda: Cheddar");
    expect(t).toContain("+ Adicional: Bacon x2");
    expect(t).toContain("SEM: CEBOLA");
    expect(t).toContain("bem assada");
    // A descrição pronta (com "•") não é impressa de novo por baixo.
    expect(t).not.toContain("(50%)");
  });

  it("acentos e caracteres especiais", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      customer_name: "Conceição Araújo 😀",
      items: [{ name: "Pão de açúcar “caseiro”", quantity: 1, unit_price: 7 }],
    };
    const com = texto(comanda(pedido, 48));
    expect(com).toContain("Conceição Araújo");
    expect(com).not.toContain("😀");
    expect(com).toContain('PÃO DE AÇÚCAR "CASEIRO"');

    const sem = comanda(pedido, 32, { acentos: false });
    semEstourar(sem, 32);
    const t = texto(sem);
    expect(t).toContain("Conceicao Araujo");
    expect(t).toContain("PAO DE ACUCAR");
    expect(t).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it("valores monetários alinhados na mesma coluna da direita", () => {
    for (const n of [32, 48]) {
      const l = comanda(PEDIDO_DE_EXEMPLO, n);
      const comValor = l.filter((x) => /R\$ [\d.]+,\d{2}$/.test(x.texto));
      expect(comValor.length).toBeGreaterThanOrEqual(6);
      for (const x of comValor) expect(x.texto).toHaveLength(n);
    }
  });

  it("dinheiro calculado em centavos: 0,1 + 0,2 não vira 0,30000000004", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      subtotal: 0.1 + 0.2,
      delivery_fee: 0,
      discount: 0,
      total: 0.3,
    };
    const t = texto(comanda(pedido, 32));
    expect(t).toMatch(/Subtotal:\s+R\$ 0,30/);
    expect(t).toMatch(/TOTAL:\s+R\$ 0,30/);
  });

  it("endereço extenso quebra dentro do papel e mantém a referência", () => {
    const pedido = {
      ...PEDIDO_DE_EXEMPLO,
      customer_address:
        "Avenida Octávio Mangabeira, 12345, Condomínio Residencial Jardim dos Coqueiros, Torre 3, Apartamento 1502, Pituaçu, Salvador - BA",
      customer_reference:
        "Em frente à padaria Pão Quente, ao lado do posto de gasolina, portão cinza",
    };
    const l = comanda(pedido, 32);
    semEstourar(l, 32);
    const t = texto(l);
    expect(t).toContain("Avenida Octávio Mangabeira");
    expect(t).toContain("Referência: Em frente à");
  });
});

describe("campos opcionais", () => {
  it("pedido mínimo (só o obrigatório) imprime sem buracos nem 'undefined'", () => {
    const minimo = { id: "abc12345-xyz", order_number: 7, total: 10, items: [] };
    const l = montarComanda(dadosDoPedido(minimo, null), {
      colunas: 32,
      acentos: true,
      agora: AGORA,
      fusoHorario: FUSO,
    });
    semEstourar(l, 32);
    const t = texto(l);
    expect(t).not.toMatch(/undefined|null|NaN/);
    expect(t).toContain("PEDIDO: #7");
    expect(t).toContain("(pedido sem itens detalhados)");
    expect(t).toContain("PAGAMENTO: NÃO INFORMADO");
    expect(t).not.toContain("CLIENTE");
    expect(t).not.toContain("Desconto");
    expect(t).not.toContain("Troco");
  });

  it("nunca duas linhas em branco seguidas no meio da comanda", () => {
    const l = comanda(PEDIDO_DE_EXEMPLO, 32);
    const corpo = l.slice(0, l.length - 3); // as 3 do fim são de propósito
    for (let i = 1; i < corpo.length; i++) {
      expect(corpo[i].texto === "" && corpo[i - 1].texto === "").toBe(false);
    }
  });

  it("termina com as linhas em branco pedidas (para o corte não pegar texto)", () => {
    const l = comanda(PEDIDO_DE_EXEMPLO, 32);
    expect(l.slice(-3).every((x) => x.texto === "")).toBe(true);
  });
});

describe("tipo de pedido", () => {
  it("retirada mostra a ficha", () => {
    const t = texto(
      comanda(
        { ...PEDIDO_DE_EXEMPLO, order_type: "pickup", ticket_number: "42", customer_address: null },
        32,
      ),
    );
    expect(t).toContain("TIPO: RETIRADA");
    expect(t).toContain("FICHA: 42");
  });

  it("mesa mostra o número da mesa", () => {
    const t = texto(comanda({ ...PEDIDO_DE_EXEMPLO, order_type: "table", table_number: "12" }, 32));
    expect(t).toContain("TIPO: MESA 12");
  });

  it("pago mostra 'JÁ PAGO' em destaque (o motoboy não cobra de novo)", () => {
    const l = comanda({ ...PEDIDO_DE_EXEMPLO, payment_status: "paid", payment_method: "pix" }, 32);
    expect(l.find((x) => x.texto === "SITUAÇÃO: JÁ PAGO")?.estilo).toBe("destaque");
    expect(texto(l)).toContain("PAGAMENTO: PIX");
  });
});

describe("pedidos de lojas diferentes ao mesmo tempo", () => {
  it("cada comanda leva só os dados da sua loja e do seu pedido", async () => {
    const lojaA = { name: "Pizzaria A" };
    const lojaB = { name: "Hamburgueria B" };
    const pedidoA = { ...PEDIDO_DE_EXEMPLO, order_number: 1, customer_name: "Cliente da A" };
    const pedidoB = { ...PEDIDO_DE_EXEMPLO, order_number: 2, customer_name: "Cliente da B" };
    const [a, b] = await Promise.all(
      [
        [pedidoA, lojaA, 32],
        [pedidoB, lojaB, 48],
      ].map(async ([p, l, n]) =>
        texto(
          montarComanda(dadosDoPedido(p, l), {
            colunas: n as number,
            acentos: true,
            agora: AGORA,
            fusoHorario: FUSO,
          }),
        ),
      ),
    );
    expect(a).toContain("PIZZARIA A");
    expect(a).toContain("Cliente da A");
    expect(a).not.toContain("Cliente da B");
    expect(a).not.toContain("HAMBURGUERIA B");
    expect(b).toContain("HAMBURGUERIA B");
    expect(b).not.toContain("Cliente da A");
  });
});

describe("comanda da mesa", () => {
  it("soma em centavos e cabe no papel", () => {
    const l = montarComandaDaMesa(
      {
        loja: "minha-loja",
        mesa: "5",
        sessao: "abcd1234",
        abertaEm: new Date("2026-11-01T22:00:00Z"),
        fechadaEm: null,
        pedidos: [
          {
            numero: "10",
            hora: new Date("2026-11-01T22:10:00Z"),
            cliente: "<script>alert(1)</script>",
            itens: [
              itemDoPedido({
                name: "Cerveja 600ml com nome bem comprido mesmo",
                quantity: 3,
                unit_price: 12.5,
              }),
            ],
            totalCentavos: 3750,
            observacoes: "trazer copo gelado",
          },
        ],
        subtotalCentavos: 3750,
        taxaDeServico: { percentual: 10, centavos: 375 },
        totalCentavos: 4125,
      },
      { colunas: 32, acentos: true, fusoHorario: FUSO },
    );
    semEstourar(l, 32);
    const t = texto(l);
    expect(t).toContain("MESA 5");
    expect(t).toMatch(/Taxa de serviço \(10%\):\s+R\$ 3,75/);
    expect(t).toMatch(/TOTAL FINAL:\s+R\$ 41,25/);
    expect(t).toContain("3x CERVEJA 600ML");
  });
});

describe("regressão: comanda de exemplo", () => {
  it("58 mm continua igual", () => {
    expect(texto(comanda(PEDIDO_DE_EXEMPLO, 32))).toMatchSnapshot();
  });
  it("80 mm continua igual", () => {
    expect(texto(comanda(PEDIDO_DE_EXEMPLO, 48))).toMatchSnapshot();
  });
});

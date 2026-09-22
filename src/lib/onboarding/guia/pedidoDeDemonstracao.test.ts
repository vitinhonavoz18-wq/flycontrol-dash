import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ID_DO_PEDIDO_DE_DEMONSTRACAO,
  NARRACAO_DO_TREINO,
  ehPedidoDeDemonstracao,
  montarPedidoDeDemonstracao,
} from "./pedidoDeDemonstracao";
import { comPedidoDeTreino } from "./treinoNoQuadro";
import type { Order } from "@/types/order";

/**
 * O pedido de treino da última etapa.
 *
 * O QUE ESTES TESTES PROTEGEM
 *
 * A tabela `orders` tem OITO gatilhos. Um pedido de mentira gravado ali
 * cobraria o lojista no plano CENTS, daria baixa no estoque dele, criaria um
 * cliente falso na lista de marketing e distribuiria pontos de fidelidade —
 * tudo por causa de um treino.
 *
 * É o treinamento de incêndio feito com fogo de verdade dentro do prédio.
 */

const pedidoReal = (id: string): Order => ({ id, status: "novo" }) as Order;

describe("o pedido de treino é reconhecível", () => {
  it("tem um id fixo, e só ele é de treino", () => {
    expect(ehPedidoDeDemonstracao(ID_DO_PEDIDO_DE_DEMONSTRACAO)).toBe(true);
    expect(ehPedidoDeDemonstracao("abc-123")).toBe(false);
    expect(ehPedidoDeDemonstracao(null)).toBe(false);
    expect(ehPedidoDeDemonstracao(undefined)).toBe(false);
  });

  it("a gravação de status pergunta isso ANTES de escrever no banco", () => {
    const hook = readFileSync("src/hooks/useUpdateOrderStatus.ts", "utf8");
    const guarda = hook.indexOf("ehPedidoDeDemonstracao(order.id)");
    const gravacao = hook.indexOf('.from("orders")');
    expect(guarda).toBeGreaterThan(0);
    expect(guarda).toBeLessThan(gravacao);
  });
});

describe("como ele é montado", () => {
  it("usa o produto REAL do cardápio do lojista", () => {
    // Um treino com "Produto Exemplo" ensina a mexer num sistema genérico.
    // Com o X-Salada que ele acabou de cadastrar, ele reconhece a loja dele.
    const p = montarPedidoDeDemonstracao("loja-1", { name: "X-Salada", price: 28.5 });
    expect((p.items as { name: string }[])[0].name).toBe("X-Salada");
    expect(p.total).toBe(28.5);
    expect(p.tenant_id).toBe("loja-1");
  });

  it("sem produto cadastrado, ainda assim funciona", () => {
    // Perder a última etapa do guia por causa de uma consulta lenta seria
    // trocar o treino inteiro por um detalhe.
    const p = montarPedidoDeDemonstracao("loja-1", null);
    expect(p.id).toBe(ID_DO_PEDIDO_DE_DEMONSTRACAO);
    expect(p.total).toBeGreaterThan(0);
  });

  it("começa em 'novo', como todo pedido que chega", () => {
    expect(montarPedidoDeDemonstracao("loja-1", null).status).toBe("novo");
  });

  it("não rouba um número da numeração da loja", () => {
    // Nenhum pedido de verdade usa o zero.
    expect(montarPedidoDeDemonstracao("loja-1", null).order_number).toBe(0);
  });

  it("o telefone é inválido de propósito", () => {
    // Se algum dia ele escapar para uma automação, não há para onde a
    // mensagem ir.
    expect(montarPedidoDeDemonstracao("loja-1", null).customer_phone).toBe("00000000000");
  });

  it("ele se anuncia como teste no próprio card", () => {
    const p = montarPedidoDeDemonstracao("loja-1", null);
    expect(p.customer_name).toContain("teste");
    expect(p.notes).toContain("Não é real");
  });
});

describe("ele entra no quadro junto com os de verdade", () => {
  it("entra na frente", () => {
    const lista = comPedidoDeTreino([pedidoReal("a")], pedidoReal(ID_DO_PEDIDO_DE_DEMONSTRACAO));
    expect(lista[0].id).toBe(ID_DO_PEDIDO_DE_DEMONSTRACAO);
    expect(lista).toHaveLength(2);
  });

  it("não duplica se já estiver na lista", () => {
    const treino = pedidoReal(ID_DO_PEDIDO_DE_DEMONSTRACAO);
    expect(comPedidoDeTreino([treino], treino)).toHaveLength(1);
  });

  it("sem treino, devolve a MESMA lista — não uma cópia", () => {
    // Criar um array novo a cada render derrubaria as memoizações do quadro
    // e faria todo card se redesenhar a cada segundo.
    const reais = [pedidoReal("a")];
    expect(comPedidoDeTreino(reais, null)).toBe(reais);
  });
});

describe("o personagem conduz cada parada do quadro", () => {
  it("tem uma fala para cada coluna, e para o fim", () => {
    for (const parada of ["novo", "preparando", "saiu", "entregue"]) {
      expect(NARRACAO_DO_TREINO[parada], `falta a fala de "${parada}"`).toBeTruthy();
      expect(NARRACAO_DO_TREINO[parada].descricao.length).toBeGreaterThan(20);
    }
  });

  it("cada fala diz o gesto a fazer, não só onde está", () => {
    expect(NARRACAO_DO_TREINO.novo.descricao).toContain("Arraste");
    expect(NARRACAO_DO_TREINO.saiu.descricao).toContain("faixa verde");
  });
});

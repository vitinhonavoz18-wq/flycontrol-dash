import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chaveDoPedidoExterno,
  ehRecusaPorPedidoRepetido,
  INDICE_DE_PEDIDO_UNICO,
  respostaDePedidoRepetido,
} from "./pedidoRepetido";

describe("número de série do pedido que vem do site", () => {
  it("usa o id de dentro do pedido antes de qualquer outro", () => {
    expect(
      chaveDoPedidoExterno({
        idDoPedido: "5b0c-uuid",
        orderIdDoCorpo: "outro",
        idDoCorpo: "mais-um",
        cabecalho: "cabecalho",
      }),
    ).toBe("5b0c-uuid");
  });

  it("na falta dele, segue a ordem que o painel sempre usou", () => {
    expect(chaveDoPedidoExterno({ orderIdDoCorpo: "a", idDoCorpo: "b", cabecalho: "c" })).toBe("a");
    expect(chaveDoPedidoExterno({ idDoCorpo: "b", cabecalho: "c" })).toBe("b");
    expect(chaveDoPedidoExterno({ cabecalho: "c" })).toBe("c");
  });

  it("aceita número e tira espaços das pontas", () => {
    expect(chaveDoPedidoExterno({ idDoPedido: 1842 })).toBe("1842");
    expect(chaveDoPedidoExterno({ idDoPedido: "  abc  " })).toBe("abc");
  });

  it("sem número de série, devolve nulo — e o pedido entra sem trava", () => {
    expect(chaveDoPedidoExterno({})).toBeNull();
    expect(chaveDoPedidoExterno({ idDoPedido: "", cabecalho: "   " })).toBeNull();
    expect(chaveDoPedidoExterno({ idDoPedido: null, idDoCorpo: undefined })).toBeNull();
  });

  it("ignora o que não é texto nem número, e o que é grande demais", () => {
    expect(chaveDoPedidoExterno({ idDoPedido: { a: 1 }, cabecalho: "ok" })).toBe("ok");
    expect(chaveDoPedidoExterno({ idDoPedido: true })).toBeNull();
    expect(chaveDoPedidoExterno({ idDoPedido: "x".repeat(201), cabecalho: "curto" })).toBe("curto");
  });
});

describe("resposta ao reenvio", () => {
  it("tem os mesmos campos de um pedido recém-gravado, para o site parar de insistir", () => {
    const r = respostaDePedidoRepetido({
      id: "uuid-do-pedido",
      order_number: 1842,
      delivery_type: "delivery",
      table_number: null,
    });
    // É exatamente isto que o site confere antes de mostrar "pedido enviado".
    expect(r.success).toBe(true);
    expect(r.order_id).toBe("uuid-do-pedido");
    expect(r.order_number).toBe(1842);
    expect(r.order_type).toBe("delivery");
    expect(r.service_mode).toBe("delivery");
    expect(r.duplicate).toBe(true);
  });

  it("pedido de mesa volta como 'mesa', igual ao pedido original", () => {
    const r = respostaDePedidoRepetido({
      id: "x",
      order_number: 7,
      delivery_type: "table",
      table_number: "12",
    });
    expect(r.service_mode).toBe("mesa");
    expect(r.table_number).toBe("12");
  });
});

describe("recusa do banco por pedido repetido", () => {
  it("reconhece a trava de pedido único", () => {
    expect(
      ehRecusaPorPedidoRepetido({
        code: "23505",
        message: `duplicate key value violates unique constraint "${INDICE_DE_PEDIDO_UNICO}"`,
      }),
    ).toBe(true);
  });

  it("não confunde com outros erros — erro de verdade continua sendo erro", () => {
    // Outra trava de unicidade (ex.: número do pedido) NÃO é pedido repetido.
    expect(
      ehRecusaPorPedidoRepetido({ code: "23505", message: 'violates "orders_order_number_key"' }),
    ).toBe(false);
    expect(ehRecusaPorPedidoRepetido({ code: "23503", message: INDICE_DE_PEDIDO_UNICO })).toBe(
      false,
    );
    expect(ehRecusaPorPedidoRepetido(null)).toBe(false);
    expect(ehRecusaPorPedidoRepetido({})).toBe(false);
  });
});

describe("a porta de entrada de pedidos usa a trava", () => {
  const rota = readFileSync("src/routes/api/orders.ts", "utf8");

  it("confere se o pedido é repetido ANTES de mexer em mesa ou gravar qualquer coisa", () => {
    const conferencia = rota.indexOf("PEDIDO_REPETIDO_IGNORADO");
    const gravacao = rota.indexOf(".insert(orderToInsert)");
    const sessaoDeMesa = rota.indexOf("TABLE_ORDER_VALIDATION");
    expect(conferencia).toBeGreaterThan(0);
    expect(conferencia).toBeLessThan(gravacao);
    if (sessaoDeMesa > 0) expect(conferencia).toBeLessThan(sessaoDeMesa);
  });

  it("procura o pedido SÓ dentro da loja dona da chave", () => {
    // Sem o filtro de loja, o número de série de uma loja poderia "achar" o
    // pedido de outra e devolver dados dela.
    const trecho = rota.slice(
      rota.indexOf("chaveDoPedidoExterno("),
      rota.indexOf("PEDIDO_REPETIDO_IGNORADO"),
    );
    expect(trecho).toContain('.eq("tenant_id", pz.id)');
    expect(trecho).toContain('.eq("external_order_id", chaveExterna)');
  });

  it("o nome da trava no código é o mesmo criado no banco", () => {
    const migracao = readFileSync(
      "supabase/migrations/20261111130000_pedido_externo_unico.sql",
      "utf8",
    );
    expect(migracao).toContain(`CREATE UNIQUE INDEX ${INDICE_DE_PEDIDO_UNICO}`);
  });
});

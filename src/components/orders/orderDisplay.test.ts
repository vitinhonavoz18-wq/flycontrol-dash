import { describe, expect, it } from "vitest";
import type { Order } from "@/types/order";
import {
  countItems,
  formatBRL,
  formatPaymentMethod,
  formatPaymentStatus,
  formatShortLocation,
  formatSource,
  getOrderTypeLabel,
  isPaid,
} from "./orderDisplay";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    order_number: 1024,
    tenant_id: "22222222-2222-2222-2222-222222222222",
    customer_name: "João da Silva",
    customer_phone: "11999990000",
    customer_address: "Rua das Flores, 123, apto 45",
    neighborhood: "Centro",
    items: [],
    total: 57.9,
    delivery_fee: 5,
    payment_method: "pix",
    change_for: null,
    notes: null,
    status: "novo",
    created_at: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

describe("formatação de valores", () => {
  it("formata em real com vírgula decimal", () => {
    expect(formatBRL(57.9)).toBe("R$ 57,90");
    expect(formatBRL("12.5")).toBe("R$ 12,50");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("não mostra NaN quando o valor está ausente ou corrompido", () => {
    expect(formatBRL(null)).toBe("R$ 0,00");
    expect(formatBRL(undefined)).toBe("R$ 0,00");
    expect(formatBRL("abc")).toBe("R$ 0,00");
  });
});

describe("contagem de itens", () => {
  it("soma as quantidades, aceitando qty ou quantity", () => {
    expect(countItems([{ qty: 2 }, { quantity: 3 }])).toBe(5);
  });

  it("conta item sem quantidade como uma unidade", () => {
    expect(countItems([{ name: "Pizza" }, { name: "Refri" }])).toBe(2);
  });

  it("ignora quantidades inválidas em vez de propagar NaN", () => {
    expect(countItems([{ qty: 0 }, { quantity: -3 }, { qty: Number.NaN }])).toBe(3);
  });

  it("devolve zero quando items não é uma lista", () => {
    expect(countItems(null)).toBe(0);
    expect(countItems({ foo: "bar" })).toBe(0);
  });
});

describe("rótulos de pagamento e origem", () => {
  it("traduz as formas de pagamento conhecidas", () => {
    expect(formatPaymentMethod("pix")).toBe("PIX");
    expect(formatPaymentMethod("DINHEIRO")).toBe("Dinheiro");
    expect(formatPaymentMethod("cartao_credito")).toBe("Cartão de crédito");
  });

  it("mostra o valor cru quando a forma é desconhecida, sem apagar a informação", () => {
    expect(formatPaymentMethod("vale-refeição")).toBe("vale-refeição");
    expect(formatPaymentMethod(null)).toBe("Não informado");
  });

  it("identifica pagamento confirmado", () => {
    expect(isPaid("paid")).toBe(true);
    expect(isPaid("pago")).toBe(true);
    expect(isPaid("pending")).toBe(false);
    expect(isPaid(null)).toBe(false);
  });

  it("omite a situação do pagamento quando não há dado", () => {
    expect(formatPaymentStatus(null)).toBeNull();
    expect(formatPaymentStatus("pending")).toBe("A receber");
  });

  it("traduz a origem do pedido", () => {
    expect(formatSource("flydelivery")).toBe("FlyDelivery");
    expect(formatSource("sitecreatorfly")).toBe("Site");
    expect(formatSource("ifood")).toBe("iFood");
    expect(formatSource("whatsapp")).toBe("WhatsApp");
    expect(formatSource(null)).toBeNull();
  });
});

describe("tipo do pedido e localização resumida", () => {
  it("rotula delivery, retirada e mesa", () => {
    expect(getOrderTypeLabel(makeOrder())).toBe("Delivery");
    expect(getOrderTypeLabel(makeOrder({ order_type: "pickup" }))).toBe("Retirada no local");
    expect(getOrderTypeLabel(makeOrder({ table_number: "7" }))).toBe("Consumo no local");
  });

  it("resume o endereço de entrega mantendo o bairro", () => {
    expect(formatShortLocation(makeOrder())).toBe("Rua das Flores — Centro");
  });

  it("trunca endereço muito longo", () => {
    const long = formatShortLocation(
      makeOrder({ customer_address: "A".repeat(80), neighborhood: null }),
    );
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(42);
  });

  it("indica retirada com a ficha quando existir", () => {
    expect(formatShortLocation(makeOrder({ order_type: "pickup", ticket_number: "42" }))).toBe(
      "Retirada · Ficha 42",
    );
    expect(formatShortLocation(makeOrder({ order_type: "pickup" }))).toBe("Retirada no balcão");
  });

  it("indica a mesa no consumo local", () => {
    expect(formatShortLocation(makeOrder({ table_number: "7" }))).toBe("Mesa 7");
  });

  it("não deixa o card vazio quando falta endereço", () => {
    expect(formatShortLocation(makeOrder({ customer_address: null }))).toBe(
      "Endereço não informado",
    );
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/order";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "pedido-1",
    order_number: 1024,
    tenant_id: "loja-1",
    customer_name: "João da Silva",
    customer_phone: "11999990000",
    customer_address: "Rua das Flores, 123",
    neighborhood: "Centro",
    items: [{ name: "Pizza", qty: 1, price: 50 }],
    total: 55,
    delivery_fee: 5,
    payment_method: "pix",
    change_for: null,
    notes: null,
    status: "saiu",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function abrir(order: Order, isPending = false) {
  const onMove = vi.fn();
  render(
    <OrderDetailsDrawer
      order={order}
      now={Date.now()}
      open
      onOpenChange={() => {}}
      isPending={isPending}
      canDelete={false}
      onMove={onMove}
      onDelete={() => {}}
    />,
  );
  const secao = screen.getByText("Mover para").parentElement!;
  return { onMove, secao };
}

describe('"Finalizar pedido" no "Mover para"', () => {
  it("aparece logo depois de Saiu para entrega", () => {
    const { secao } = abrir(makeOrder());
    const nomes = within(secao)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(nomes).toEqual(["Novo pedido", "Em preparo", "Saiu para entrega", "Finalizar pedido"]);
  });

  it("finaliza com um toque, pelo mesmo caminho do arraste", async () => {
    const order = makeOrder({ status: "saiu" });
    const { onMove, secao } = abrir(order);
    await userEvent.click(within(secao).getByRole("button", { name: /finalizar pedido/i }));
    expect(onMove).toHaveBeenCalledWith(order, "entregue");
  });

  it("em preparo também finaliza — balcão e mesa não têm entregador", () => {
    const { secao } = abrir(makeOrder({ status: "preparando" }));
    expect(within(secao).getByRole("button", { name: /finalizar pedido/i })).toBeEnabled();
  });

  it("pedido novo não finaliza sem antes ser aceito, e a tela diz por quê", () => {
    const { secao } = abrir(makeOrder({ status: "novo" }));
    const botao = within(secao).getByRole("button", { name: /finalizar pedido/i });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", expect.stringContaining("Aceite o pedido"));
  });

  it("fica travado enquanto outra mudança do mesmo pedido está gravando", () => {
    const { secao } = abrir(makeOrder(), true);
    expect(within(secao).getByRole("button", { name: /finalizar pedido/i })).toBeDisabled();
  });
});

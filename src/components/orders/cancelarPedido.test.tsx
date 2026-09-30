import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/order";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";

/**
 * Cancelar (ou recusar) um pedido pelos detalhes.
 *
 * O botão existe para a loja não deixar pedido parado no quadro — e o cliente
 * esperando no aplicativo — quando não vai conseguir atender. E ele PERGUNTA
 * antes: um clique perdido não pode sumir com o pedido de alguém.
 */

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: 1024,
    tenant_id: "tenant-1",
    customer_name: "Maria",
    customer_phone: "11999990000",
    customer_address: "Rua das Flores, 123",
    neighborhood: "Centro",
    items: [],
    total: 57.9,
    delivery_fee: 5,
    payment_method: "pix",
    change_for: null,
    notes: null,
    status: "novo",
    created_at: "2026-09-30T12:00:00Z",
    source: "flydelivery",
    ...overrides,
  } as Order;
}

function renderDrawer(order: Order, onMove = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <OrderDetailsDrawer
      order={order}
      now={Date.parse("2026-09-30T12:05:00Z")}
      open
      onOpenChange={onOpenChange}
      isPending={false}
      canDelete={false}
      onMove={onMove}
      onDelete={vi.fn()}
    />,
  );
  return { onMove, onOpenChange };
}

describe("cancelar pelo detalhe do pedido", () => {
  it("pedido novo mostra 'Recusar pedido' e só cancela depois de confirmar", () => {
    const order = makeOrder({ status: "novo" });
    const { onMove, onOpenChange } = renderDrawer(order);

    fireEvent.click(screen.getByRole("button", { name: /Recusar pedido/ }));
    // Abriu a pergunta — ainda não gravou nada.
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText(/Recusar o pedido #1024\?/)).toBeTruthy();
    expect(screen.getByText(/aplicativo FlyDelivery/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sim, recusar pedido/ }));
    expect(onMove).toHaveBeenCalledWith(order, "cancelado");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("'Voltar' fecha a pergunta sem cancelar", () => {
    const { onMove } = renderDrawer(makeOrder({ status: "preparando" }));

    fireEvent.click(screen.getByRole("button", { name: /Cancelar pedido/ }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("pedido que já saiu do quadro não oferece cancelar", () => {
    renderDrawer(makeOrder({ status: "entregue" }));
    expect(screen.queryByRole("button", { name: /Cancelar pedido|Recusar pedido/ })).toBeNull();
  });
});

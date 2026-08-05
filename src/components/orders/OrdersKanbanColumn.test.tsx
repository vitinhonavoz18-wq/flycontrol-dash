import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/order";
import { OrdersKanbanColumn } from "./OrdersKanbanColumn";
import { DELAY_THRESHOLD_MINUTES, getColumnConfig } from "./orderStatusConfig";

const NOW = new Date("2026-08-05T12:00:00Z").getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: crypto.randomUUID(),
    order_number: 1024,
    tenant_id: "22222222-2222-2222-2222-222222222222",
    customer_name: "João da Silva",
    customer_phone: "11999990000",
    customer_address: "Rua das Flores, 123",
    neighborhood: "Centro",
    items: [{ name: "Pizza", qty: 2 }, { name: "Refrigerante" }],
    total: 57.9,
    delivery_fee: 5,
    payment_method: "pix",
    change_for: null,
    notes: null,
    status: "novo",
    created_at: minutesAgo(5),
    payment_status: "pending",
    source: "whatsapp",
    ...overrides,
  };
}

/** O dnd-kit exige um DndContext acima de qualquer droppable/draggable. */
function renderInBoard(node: ReactNode) {
  return render(<DndContext>{node}</DndContext>);
}

function renderColumn(props: Partial<Parameters<typeof OrdersKanbanColumn>[0]> = {}) {
  const onOpenDetails = vi.fn();
  renderInBoard(
    <OrdersKanbanColumn
      config={getColumnConfig("novo")}
      orders={[]}
      now={NOW}
      draggingFromStatus={null}
      pendingIds={new Set()}
      recentNewIds={[]}
      waiterNames={{}}
      onOpenDetails={onOpenDetails}
      {...props}
    />,
  );
  return { onOpenDetails };
}

describe("coluna do Kanban", () => {
  it("mostra o rótulo da etapa e o contador de pedidos", () => {
    renderColumn({ orders: [makeOrder(), makeOrder(), makeOrder()] });

    expect(screen.getByRole("heading", { name: "Novo pedido" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("anuncia a quantidade para leitores de tela", () => {
    renderColumn({ orders: [makeOrder()] });
    expect(screen.getByRole("region", { name: /Novo pedido: 1 pedido$/ })).toBeInTheDocument();
  });

  it("exibe o estado vazio quando não há pedidos, mantendo a área de soltura", () => {
    renderColumn();
    expect(screen.getByText("Nenhum novo pedido no momento.")).toBeInTheDocument();
    expect(screen.getByText("Arraste um pedido para cá")).toBeInTheDocument();
  });

  it("usa o texto de vazio próprio de cada coluna", () => {
    renderColumn({ config: getColumnConfig("saiu") });
    expect(screen.getByText("Nenhum pedido saiu para entrega.")).toBeInTheDocument();
  });
});

describe("card do pedido", () => {
  it("mostra as informações principais exigidas na operação", () => {
    renderColumn({ orders: [makeOrder()] });

    expect(screen.getByText("#1024")).toBeInTheDocument();
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.getByText(/3 itens/)).toBeInTheDocument();
    expect(screen.getByText("R$ 57,90")).toBeInTheDocument();
    expect(screen.getByText("PIX")).toBeInTheDocument();
    expect(screen.getByText("A receber")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("DELIVERY")).toBeInTheDocument();
    expect(screen.getByText("Há 5 minutos")).toBeInTheDocument();
  });

  it("marca visualmente o pedido atrasado", () => {
    renderColumn({
      orders: [makeOrder({ created_at: minutesAgo(DELAY_THRESHOLD_MINUTES.late + 1) })],
    });
    expect(screen.getByText("ATRASADO")).toBeInTheDocument();
  });

  it("não marca como atrasado um pedido dentro do prazo", () => {
    renderColumn({ orders: [makeOrder({ created_at: minutesAgo(2) })] });
    expect(screen.queryByText("ATRASADO")).not.toBeInTheDocument();
  });

  it("descreve o atraso em texto, e não só pela cor", () => {
    renderColumn({
      orders: [makeOrder({ created_at: minutesAgo(DELAY_THRESHOLD_MINUTES.late + 5) })],
    });
    expect(screen.getByText(/atrasado: mais de 20 minutos/)).toBeInTheDocument();
  });

  it("destaca o pedido recém-chegado", () => {
    const order = makeOrder();
    renderColumn({ orders: [order], recentNewIds: [order.id] });
    expect(screen.getByText("NOVO")).toBeInTheDocument();
  });

  it("mostra o responsável quando o pedido tem garçom", () => {
    const order = makeOrder({ waiter_id: "w-1" });
    renderColumn({ orders: [order], waiterNames: { "w-1": "Maria" } });
    expect(screen.getByText("Maria")).toBeInTheDocument();
  });

  it("abre os detalhes pelo botão sem depender do arraste", async () => {
    const order = makeOrder();
    const { onOpenDetails } = renderColumn({ orders: [order] });

    await userEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledWith(order);
  });

  it("bloqueia a ação e sinaliza carregamento enquanto a gravação está em curso", () => {
    const order = makeOrder();
    renderColumn({ orders: [order], pendingIds: new Set([order.id]) });

    expect(screen.getByRole("button", { name: "Ver detalhes" })).toBeDisabled();
    expect(screen.getByText("Atualizando pedido…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pedido 1024/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("identifica o pedido e sua etapa para leitores de tela", () => {
    renderColumn({ orders: [makeOrder()] });
    // O dnd-kit marca a área arrastável como role="button" e a torna focável,
    // que é o que permite mover o card pelo teclado.
    expect(
      screen.getByRole("button", { name: /Pedido 1024 de João da Silva, etapa Novo pedido/ }),
    ).toBeInTheDocument();
  });

  it("mantém o botão de detalhes fora da área arrastável", () => {
    renderColumn({ orders: [makeOrder()] });
    const draggable = screen.getByRole("button", { name: /^Pedido 1024/ });
    const details = screen.getByRole("button", { name: "Ver detalhes" });
    // Botão dentro de botão é HTML inválido e quebra leitores de tela.
    expect(draggable.contains(details)).toBe(false);
  });
});

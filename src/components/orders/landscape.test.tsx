import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/order";
import { OrdersKanbanColumn } from "./OrdersKanbanColumn";
import { getColumnConfig } from "./orderStatusConfig";

const NOW = new Date("2026-08-05T12:00:00Z").getTime();

function makeOrder(): Order {
  return {
    id: crypto.randomUUID(),
    order_number: 1024,
    tenant_id: "tenant-1",
    customer_name: "João da Silva",
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
    created_at: new Date(NOW).toISOString(),
  };
}

function renderColumn() {
  const { container } = render(
    <DndContext>
      <OrdersKanbanColumn
        config={getColumnConfig("novo")}
        orders={[makeOrder()]}
        now={NOW}
        draggingFromStatus={null}
        pendingIds={new Set()}
        recentNewIds={[]}
        waiterNames={{}}
        onOpenDetails={vi.fn()}
      />
    </DndContext>,
  );
  return container;
}

describe("manifesto da PWA", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
    orientation?: string;
  };

  it("não trava o aplicativo em retrato", () => {
    // `orientation: "portrait"` impedia a PWA instalada de girar, por mais
    // responsivo que o CSS fosse.
    expect(manifest.orientation).not.toBe("portrait");
    expect(manifest.orientation).not.toBe("portrait-primary");
  });

  it("também não força paisagem — quem decide é o usuário", () => {
    expect(manifest.orientation).not.toBe("landscape");
    expect(manifest.orientation).toBe("any");
  });
});

describe("colunas do Kanban em paisagem", () => {
  it("nunca colapsa a altura da coluna", () => {
    const container = renderColumn();
    const scrollArea = container.querySelector<HTMLElement>("[class*='max-h-']");
    expect(scrollArea).not.toBeNull();

    const className = scrollArea!.className;
    // A regressão original: `calc(100vh-22rem)` dava 8px de altura em um
    // celular deitado de 360px. O `max()` estabelece um piso.
    expect(className).not.toContain("calc(100vh-22rem)");
    expect(className).toContain("max(");
    // `dvh` acompanha a barra de endereço do navegador mobile; `vh` não.
    expect(className).toContain("dvh");
  });

  it("coloca as três colunas lado a lado a partir da largura de um celular deitado", () => {
    const container = renderColumn();
    const section = container.querySelector("section")!;
    // 640px é a menor largura de celular em paisagem (640x360). No Tailwind
    // esse ponto se chama `sm`, e é o mesmo número que o antigo
    // `min-[640px]` escrito à mão — a regra não mudou de lugar, só passou a
    // ser escrita com o nome que o resto do projeto usa.
    expect(section.className).toContain("sm:flex-1");
    // A partir daí a coluna também precisa PODER encolher. Sem isso ela
    // fica presa no tamanho do texto de dentro e as três não cabem juntas.
    expect(section.className).toContain("sm:shrink");
    expect(section.className).toMatch(/sm:min-w-\[\d+rem\]/);
  });

  it("mantém a rolagem horizontal em retrato, onde as colunas não cabem", () => {
    const container = renderColumn();
    const section = container.querySelector("section")!;
    expect(section.className).toContain("w-[85vw]");
    expect(section.className).toContain("shrink-0");
  });

  it("preserva a rolagem vertical independente por coluna", () => {
    const container = renderColumn();
    const scrollArea = container.querySelector<HTMLElement>("[class*='max-h-']")!;
    expect(scrollArea.className).toContain("overflow-y-auto");
  });

  it("continua sendo alvo de soltura, para o arraste funcionar deitado", () => {
    renderColumn();
    expect(screen.getByRole("region", { name: /Novo pedido/ })).toBeInTheDocument();
  });
});

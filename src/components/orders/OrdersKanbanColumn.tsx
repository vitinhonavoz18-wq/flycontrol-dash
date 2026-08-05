import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/types/order";
import { EmptyColumnState } from "./EmptyColumnState";
import { OrderKanbanCard } from "./OrderKanbanCard";
import type { OrderColumnConfig } from "./orderStatusConfig";

export type OrdersKanbanColumnProps = {
  config: OrderColumnConfig;
  orders: Order[];
  now: number;
  /** Status de origem do card em arraste; `null` quando nada está sendo arrastado. */
  draggingFromStatus: string | null;
  pendingIds: ReadonlySet<string>;
  recentNewIds: readonly string[];
  waiterNames: Readonly<Record<string, string>>;
  onOpenDetails: (order: Order) => void;
};

export function OrdersKanbanColumn({
  config,
  orders,
  now,
  draggingFromStatus,
  pendingIds,
  recentNewIds,
  waiterNames,
  onOpenDetails,
}: OrdersKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: config.id });

  // Só destaca colunas que aceitam o card em movimento — soltar na coluna de
  // origem não faz nada, então ela não deve parecer um alvo válido.
  const isValidTarget = draggingFromStatus !== null && draggingFromStatus !== config.id;
  const highlight = isOver && isValidTarget;

  return (
    <section
      aria-label={`${config.label}: ${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`}
      className="flex w-[85vw] shrink-0 flex-col sm:w-[20rem] md:w-auto md:flex-1"
    >
      <header className="mb-2 overflow-hidden rounded-t-xl border border-b-0 border-border bg-card">
        <div className={`h-1 w-full ${config.accentBar}`} aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-foreground">{config.label}</h3>
            <p className="truncate text-[10px] text-muted-foreground">{config.description}</p>
          </div>
          <Badge variant="outline" className={`shrink-0 font-black ${config.accentBadge}`}>
            {orders.length}
          </Badge>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={`flex min-h-[12rem] flex-1 flex-col gap-2 rounded-b-xl border border-t-0 border-border bg-muted/20 p-2 transition-all md:max-h-[calc(100vh-22rem)] md:overflow-y-auto ${
          highlight ? `ring-2 ring-inset ${config.accentDropRing}` : ""
        } ${isValidTarget && !isOver ? "border-dashed" : ""}`}
      >
        {orders.length === 0 ? (
          <EmptyColumnState label={config.emptyLabel} />
        ) : (
          orders.map((order) => (
            <OrderKanbanCard
              key={order.id}
              order={order}
              now={now}
              isRecentNew={recentNewIds.includes(order.id)}
              isPending={pendingIds.has(order.id)}
              waiterName={order.waiter_id ? (waiterNames[order.waiter_id] ?? null) : null}
              onOpenDetails={onOpenDetails}
            />
          ))
        )}
      </div>
    </section>
  );
}

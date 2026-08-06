import type { Order } from "@/types/order";
import { OrderCardContent } from "./OrderKanbanCard";

/**
 * Cópia do card que acompanha o cursor durante o arraste. Renderizada dentro do
 * `DragOverlay` do dnd-kit, fora do fluxo das colunas — por isso não repete as
 * ações do card original.
 */
export function OrderCardOverlay({ order, now }: { order: Order; now: number }) {
  return (
    <div className="w-[var(--kanban-card-width,18rem)] rotate-2 cursor-grabbing rounded-xl border-2 border-primary bg-card p-3 shadow-2xl">
      <OrderCardContent order={order} now={now} />
    </div>
  );
}

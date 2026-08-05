import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types/order";
import { useUpdateOrderStatus } from "@/hooks/useUpdateOrderStatus";
import { OrderCardOverlay } from "./OrderCardOverlay";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { OrdersKanbanColumn } from "./OrdersKanbanColumn";
import {
  ELAPSED_TICK_MS,
  ORDER_COLUMNS,
  getStatusLabel,
  isKanbanStatus,
  type KanbanStatus,
} from "./orderStatusConfig";

export type OrdersKanbanProps = {
  /** Pedidos já filtrados pela tela. */
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  tenantId: string | null;
  recentNewIds: readonly string[];
  canDelete: boolean;
  onDelete: (order: Order) => void;
  /** Automações já existentes disparadas após a gravação (arte de status). */
  onStatusApplied?: (order: Order, status: string) => void;
};

/**
 * Relógio compartilhado por todos os cards.
 *
 * Um único intervalo alimenta os contadores de tempo decorrido; ter um timer
 * por card faria dezenas de renders independentes por minuto.
 */
function useSharedClock(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Mapa `waiter_id → nome`, para exibir o responsável no card. */
function useWaiterNames(tenantId: string | null): Readonly<Record<string, string>> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!tenantId) {
      setNames({});
      return;
    }
    let cancelled = false;

    supabase
      .from("waiters")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // O nome do responsável é enfeite: se falhar, o card segue sem ele.
          console.warn("[kanban] não foi possível carregar os garçons:", error.message);
          return;
        }
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[row.id] = row.full_name;
        setNames(map);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return names;
}

export function OrdersKanban({
  orders,
  setOrders,
  tenantId,
  recentNewIds,
  canDelete,
  onDelete,
  onStatusApplied,
}: OrdersKanbanProps) {
  const now = useSharedClock(ELAPSED_TICK_MS);
  const waiterNames = useWaiterNames(tenantId);
  const { moveOrder, pendingIds } = useUpdateOrderStatus({ setOrders, tenantId, onStatusApplied });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const sensors = useSensors(
    // Mouse e caneta: um pequeno deslocamento separa clique de arraste.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Toque: só arrasta depois de segurar, para não roubar a rolagem do dedo.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /** Um balde por coluna, preenchido em uma passada só. */
  const ordersByStatus = useMemo(() => {
    const buckets: Record<KanbanStatus, Order[]> = { novo: [], preparando: [], saiu: [] };
    for (const order of orders) {
      if (isKanbanStatus(order.status)) buckets[order.status].push(order);
    }
    return buckets;
  }, [orders]);

  const activeOrder = useMemo(
    () => (activeId ? (orders.find((o) => o.id === activeId) ?? null) : null),
    [activeId, orders],
  );

  const detailsOrder = useMemo(
    () => (detailsId ? (orders.find((o) => o.id === detailsId) ?? null) : null),
    [detailsId, orders],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const target = String(over.id);
      if (!isKanbanStatus(target)) return;

      const order = orders.find((o) => o.id === String(active.id));
      if (!order) return;

      void moveOrder(order, target);
    },
    [moveOrder, orders],
  );

  const handleMoveFromDrawer = useCallback(
    (order: Order, status: KanbanStatus) => {
      void moveOrder(order, status);
    },
    [moveOrder],
  );

  /** Narração do arraste para leitores de tela. */
  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => {
        const order = orders.find((o) => o.id === String(active.id));
        return order
          ? `Pedido ${order.order_number} selecionado, atualmente em ${getStatusLabel(order.status)}.`
          : "Pedido selecionado.";
      },
      onDragOver: ({ over }) =>
        over && isKanbanStatus(String(over.id))
          ? `Sobre a coluna ${getStatusLabel(String(over.id))}.`
          : "Fora de qualquer coluna.",
      onDragEnd: ({ active, over }) => {
        const order = orders.find((o) => o.id === String(active.id));
        if (!over || !isKanbanStatus(String(over.id))) {
          return "Movimentação cancelada, o pedido permanece na etapa atual.";
        }
        return `Pedido ${order?.order_number ?? ""} movido para ${getStatusLabel(String(over.id))}.`;
      },
      onDragCancel: () => "Movimentação cancelada.",
    }),
    [orders],
  );

  const draggingFromStatus = activeOrder?.status ?? null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Desktop: três colunas lado a lado. Telas estreitas: rolagem
            horizontal, mantendo as colunas visíveis para o arraste. */}
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 md:overflow-x-visible">
          {ORDER_COLUMNS.map((config) => (
            <OrdersKanbanColumn
              key={config.id}
              config={config}
              orders={ordersByStatus[config.id]}
              now={now}
              draggingFromStatus={draggingFromStatus}
              pendingIds={pendingIds}
              recentNewIds={recentNewIds}
              waiterNames={waiterNames}
              onOpenDetails={(order) => setDetailsId(order.id)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOrder ? <OrderCardOverlay order={activeOrder} now={now} /> : null}
        </DragOverlay>
      </DndContext>

      <OrderDetailsDrawer
        order={detailsOrder}
        now={now}
        open={detailsOrder !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
        isPending={detailsOrder ? pendingIds.has(detailsOrder.id) : false}
        canDelete={canDelete}
        onMove={handleMoveFromDrawer}
        onDelete={onDelete}
      />
    </>
  );
}

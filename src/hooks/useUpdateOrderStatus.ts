import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types/order";
import {
  canMoveOrder,
  getStatusLabel,
  type KanbanStatus,
} from "@/components/orders/orderStatusConfig";

/**
 * Origem registrada no histórico para alterações feitas pelo quadro.
 * Alterações feitas pelo seletor antigo continuam sem origem própria.
 */
export const STATUS_CHANGE_SOURCE = "dashboard_kanban";

type UseUpdateOrderStatusParams = {
  /** Aplica uma alteração à lista de pedidos do dashboard. */
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  /** Empresa dona dos pedidos — usada no histórico e como trava extra. */
  tenantId: string | null;
  /** Chamado após a gravação confirmada, para as automações já existentes. */
  onStatusApplied?: (order: Order, status: string) => void;
};

type MoveResult = { ok: boolean };

/**
 * Linha do histórico de status. A tabela é criada pela migration
 * `order_status_history`; enquanto ela não for aplicada, a gravação falha e é
 * apenas registrada no console — nunca derruba a mudança de status.
 */
type OrderStatusHistoryInsert = {
  order_id: string;
  tenant_id: string;
  from_status: string;
  to_status: string;
  changed_by: string | null;
  source: string;
  note: string | null;
};

/** Postgres: relação inexistente. A migration ainda não foi aplicada. */
const UNDEFINED_TABLE = "42P01";

export function useUpdateOrderStatus({
  setOrders,
  tenantId,
  onStatusApplied,
}: UseUpdateOrderStatusParams) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // Espelho síncrono: `pendingIds` só reflete no próximo render, e dois drops
  // rápidos no mesmo card aconteceriam antes disso.
  const inFlight = useRef<Set<string>>(new Set());

  const markPending = useCallback((id: string, pending: boolean) => {
    if (pending) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setPendingIds(new Set(inFlight.current));
  }, []);

  const recordHistory = useCallback(async (entry: OrderStatusHistoryInsert) => {
    // A tabela não está em `types.ts` porque a migration ainda não foi aplicada
    // ao projeto Supabase. O cast some quando os tipos forem regerados.
    const client = supabase as unknown as {
      from: (table: string) => {
        insert: (
          values: OrderStatusHistoryInsert,
        ) => Promise<{ error: { code?: string; message: string } | null }>;
      };
    };
    const { error } = await client.from("order_status_history").insert(entry);
    if (!error) return;
    if (error.code === UNDEFINED_TABLE) {
      console.warn(
        "[order-status] histórico não gravado: tabela order_status_history ainda não existe. " +
          "Aplique a migration correspondente.",
      );
      return;
    }
    console.error("[order-status] falha ao gravar histórico:", error.message);
  }, []);

  /**
   * Move um pedido para outra coluna.
   *
   * A interface é atualizada antes da resposta do banco e revertida se a
   * gravação falhar. A gravação é condicional ao status anterior: se outro
   * operador já moveu o pedido, nenhuma linha é afetada e o estado local é
   * ressincronizado em vez de sobrescrever a alteração mais recente.
   */
  const moveOrder = useCallback(
    async (order: Order, toStatus: KanbanStatus): Promise<MoveResult> => {
      if (inFlight.current.has(order.id)) return { ok: false };

      const fromStatus = order.status;
      const check = canMoveOrder(fromStatus, toStatus);
      if (!check.allowed) {
        // Soltar o card na própria coluna é gesto acidental, não erro.
        if (fromStatus !== toStatus) toast.error(check.reason);
        return { ok: false };
      }

      markPending(order.id, true);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: toStatus, is_seen: true } : o)),
      );

      const rollback = () =>
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: fromStatus } : o)),
        );

      try {
        const { data, error } = await supabase
          .from("orders")
          .update({ status: toStatus })
          .eq("id", order.id)
          .eq("status", fromStatus)
          .select("id, status, updated_at");

        if (error) {
          rollback();
          console.error("[order-status] falha ao atualizar pedido:", error);
          toast.error("Não foi possível atualizar o pedido. Tente novamente.");
          return { ok: false };
        }

        if (!data || data.length === 0) {
          // Nenhuma linha bateu: ou outro operador mudou o status antes, ou o
          // pedido saiu do alcance deste usuário. Buscamos o estado real.
          const { data: current } = await supabase
            .from("orders")
            .select("id, status")
            .eq("id", order.id)
            .maybeSingle();

          rollback();

          if (!current) {
            setOrders((prev) => prev.filter((o) => o.id !== order.id));
            toast.error("Este pedido não está mais disponível. A lista foi atualizada.");
            return { ok: false };
          }

          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, status: current.status } : o)),
          );
          toast.warning(
            `Este pedido foi atualizado por outro usuário e está em "${getStatusLabel(current.status)}". Os dados foram recarregados.`,
          );
          return { ok: false };
        }

        const { data: session } = await supabase.auth.getSession();
        await recordHistory({
          order_id: order.id,
          tenant_id: tenantId ?? order.tenant_id,
          from_status: fromStatus,
          to_status: toStatus,
          changed_by: session?.session?.user?.id ?? null,
          source: STATUS_CHANGE_SOURCE,
          note: null,
        });

        onStatusApplied?.({ ...order, status: toStatus }, toStatus);
        return { ok: true };
      } catch (err) {
        rollback();
        console.error("[order-status] erro inesperado ao mover pedido:", err);
        toast.error("Não foi possível atualizar o pedido. Verifique sua conexão.");
        return { ok: false };
      } finally {
        markPending(order.id, false);
      }
    },
    [markPending, onStatusApplied, recordHistory, setOrders, tenantId],
  );

  return { moveOrder, pendingIds };
}

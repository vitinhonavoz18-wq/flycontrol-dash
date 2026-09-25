import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types/order";
import { ehPedidoDeDemonstracao } from "@/lib/onboarding/guia/pedidoDeDemonstracao";
import {
  canMoveOrder,
  getStatusLabel,
  type MoveTarget,
} from "@/components/orders/orderStatusConfig";

type UseUpdateOrderStatusParams = {
  /** Aplica uma alteração à lista de pedidos do dashboard. */
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  /**
   * Empresa dona dos pedidos. Não é mais usada aqui (o histórico é gravado
   * pelo banco), mas continua aceita para não mudar quem chama.
   */
  tenantId?: string | null;
  /** Chamado após a gravação confirmada, para as automações já existentes. */
  onStatusApplied?: (order: Order, status: string) => void;
};

type MoveResult = { ok: boolean };

/*
 * HISTÓRICO: quem grava é o banco, não esta tela.
 *
 * Toda mudança de `orders.status` vira uma linha em `order_status_history`
 * pelo gatilho `orders_record_status_history`, na MESMA operação da mudança
 * (migração `20260927120000_pedido_ao_vivo.sql`). Antes, esta tela gravava o
 * histórico numa segunda chamada: se a internet caísse entre as duas, o
 * status mudava e o histórico não. E o seletor da lista, o cancelamento e as
 * automações não gravavam nada.
 */
export function useUpdateOrderStatus({ setOrders, onStatusApplied }: UseUpdateOrderStatusParams) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // Espelho síncrono: `pendingIds` só reflete no próximo render, e dois drops
  // rápidos no mesmo card aconteceriam antes disso.
  const inFlight = useRef<Set<string>>(new Set());

  const markPending = useCallback((id: string, pending: boolean) => {
    if (pending) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setPendingIds(new Set(inFlight.current));
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
    async (order: Order, toStatus: MoveTarget): Promise<MoveResult> => {
      if (inFlight.current.has(order.id)) return { ok: false };

      const fromStatus = order.status;
      const check = canMoveOrder(fromStatus, toStatus);
      if (!check.allowed) {
        // Soltar o card na própria coluna é gesto acidental, não erro.
        if (fromStatus !== toStatus) toast.error(check.reason);
        return { ok: false };
      }

      // ═══════════════════════════════════════════════════════════════
      // O PEDIDO DE TREINO NÃO ENCOSTA NO BANCO
      // ═══════════════════════════════════════════════════════════════
      //
      // Ele é o pedido de mentira da última etapa do guia. Gravar a mudança
      // de status dele dispararia os gatilhos da tabela `orders`: cobrança no
      // plano CENTS, baixa de estoque, ponto de fidelidade e cliente novo na
      // lista de marketing — tudo por causa de um treino.
      //
      // É o treinamento de incêndio feito com fogo de verdade dentro do
      // prédio. Aqui a regra de transição é a mesma (ele não pula etapa), o
      // card anda no quadro igual, e nada sai da tela.
      if (ehPedidoDeDemonstracao(order.id)) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: toStatus } : o)));
        if (toStatus === "entregue") toast.success("Pedido finalizado com sucesso.");
        return { ok: true };
      }

      // Finalizar é a única transição que TIRA o pedido do quadro. Ela
      // merece aviso próprio nos dois desfechos: quem some com um pedido da
      // tela precisa saber se sumiu porque deu certo ou porque deu errado.
      const finalizando = toStatus === "entregue";
      const erroGenerico = finalizando
        ? "Não foi possível finalizar o pedido. Tente novamente."
        : "Não foi possível atualizar o pedido. Tente novamente.";

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
          toast.error(erroGenerico);
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

        if (finalizando) toast.success("Pedido finalizado com sucesso.");

        onStatusApplied?.({ ...order, status: toStatus }, toStatus);
        return { ok: true };
      } catch (err) {
        rollback();
        console.error("[order-status] erro inesperado ao mover pedido:", err);
        toast.error(erroGenerico);
        return { ok: false };
      } finally {
        markPending(order.id, false);
      }
    },
    [markPending, onStatusApplied, setOrders],
  );

  return { moveOrder, pendingIds };
}

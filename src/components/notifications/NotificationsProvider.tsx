import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { playSound, unlockAudio, isAudioBlocked } from "@/lib/notification-sounds";
import { claimOrderAlert } from "@/lib/orderAlertClaim";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { produtosAcabando } from "@/lib/inventory/alertas.functions";

/**
 * Global admin listener: NEW ORDERS ONLY.
 *
 * Customer close requests are NOT handled here anymore. They are delivered
 * exclusively to the assigned waiter's page (WaiterNotificationCenter) as a
 * passive notification. The admin has no popup — the operator continues to
 * finalize tables from the Tables management screen as before.
 */
export function NotificationsProvider() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzeriaIds, setPizzeriaIds] = useState<string[] | "__all__" | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const seenOrderIds = useRef<Set<string>>(new Set());
  const avisadosDeEstoque = useRef<Set<string>>(new Set());
  const avisarEstoque = useServerFn(produtosAcabando);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    async function load() {
      if (!user) {
        setPizzeriaIds(null);
        return;
      }
      if (isSuperAdmin) {
        setPizzeriaIds("__all__");
        return;
      }
      const { data, error } = await supabase
        .from("pizzerias")
        .select("id")
        .eq("owner_id", user.id)
        .neq("status", "deleted")
        .neq("status", "inactive");
      if (cancelled) return;
      if (error) {
        attempt += 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
        console.error(`[NotificationsProvider] pizzerias load error (retry in ${delay}ms):`, error);
        retryTimer = setTimeout(() => {
          if (!cancelled) void load();
        }, delay);
        return;
      }
      const ids = (data || []).map((p: any) => p.id);
      setPizzeriaIds(ids);
    }
    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, isSuperAdmin]);

  // Realtime: new orders
  useEffect(() => {
    if (!pizzeriaIds) return;
    const channel = supabase
      .channel("orders-notify-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row: any = payload.new;
        if (!row?.id || seenOrderIds.current.has(row.id)) return;
        if (pizzeriaIds !== "__all__" && !pizzeriaIds.includes(row.tenant_id)) {
          return;
        }
        seenOrderIds.current.add(row.id);
        // Se o Dashboard já está aberto na mesma loja, ele mesmo avisa esse
        // pedido primeiro — evita tocar o som e mostrar o aviso duas vezes.
        if (!claimOrderAlert(row.id)) return;
        playSound("new_order");
        const tipo = row.table_number
          ? `Mesa ${row.table_number}`
          : row.order_type === "pickup" || row.service_mode === "pickup"
            ? "Retirada"
            : "Delivery";
        toast.success(`Novo pedido — ${tipo}`, {
          description: row.customer_name || undefined,
        });
        if (isAudioBlocked()) setAudioBlocked(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pizzeriaIds]);

  // Estoque acabando.
  //
  // Confere ao abrir o painel e de meia em meia hora. Cada produto é avisado
  // uma vez por sessão: repetir o mesmo aviso a cada meia hora faria o dono
  // parar de ler todos eles, inclusive o que importava.
  useEffect(() => {
    if (!pizzeriaIds || pizzeriaIds === "__all__" || pizzeriaIds.length === 0) return;

    let cancelado = false;

    async function conferir() {
      try {
        const acabando = await avisarEstoque({ data: { tenantIds: pizzeriaIds as string[] } });
        if (cancelado) return;

        const novos = acabando.filter((p) => !avisadosDeEstoque.current.has(p.id));
        if (novos.length === 0) return;
        novos.forEach((p) => avisadosDeEstoque.current.add(p.id));

        const acabaram = novos.filter((p) => p.acabou);
        const primeiro = novos[0];
        const resto = novos.length - 1;

        toast.warning(
          novos.length === 1
            ? `${primeiro.name}: ${primeiro.acabou ? "acabou" : `restam ${primeiro.stock_base} ${primeiro.base_unit}`}`
            : `${novos.length} produtos no estoque mínimo${acabaram.length > 0 ? ` — ${acabaram.length} já acabou` : ""}`,
          {
            description:
              novos.length === 1
                ? "Vale repor antes que falte no meio do movimento."
                : `${primeiro.name}${resto > 0 ? ` e mais ${resto}` : ""}. Veja em Estoque › Visão Geral.`,
            duration: 10000,
          },
        );
      } catch {
        // Loja sem o módulo, sem permissão ou rede caindo: o aviso de estoque
        // é um extra e nunca pode atrapalhar o painel de pedidos.
      }
    }

    void conferir();
    const timer = setInterval(() => void conferir(), 30 * 60 * 1000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [avisarEstoque, pizzeriaIds]);

  // Browser audio block events
  useEffect(() => {
    const onBlocked = () => setAudioBlocked(true);
    const onUnlocked = () => setAudioBlocked(false);
    window.addEventListener("fc-audio-blocked", onBlocked);
    window.addEventListener("fc-audio-unlocked", onUnlocked);
    return () => {
      window.removeEventListener("fc-audio-blocked", onBlocked);
      window.removeEventListener("fc-audio-unlocked", onUnlocked);
    };
  }, []);

  if (!audioBlocked) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9998]">
      <Button
        size="sm"
        onClick={async () => {
          const ok = await unlockAudio();
          if (ok) {
            setAudioBlocked(false);
            toast.success("Sons de notificação ativados");
          }
        }}
        className="shadow-lg bg-orange-500 hover:bg-orange-600 text-white"
      >
        <Volume2 className="h-4 w-4 mr-2" /> Ativar sons de notificação
      </Button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { playSound, unlockAudio, isAudioBlocked } from "@/lib/notification-sounds";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

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
        .neq("status", "deleted");
      if (cancelled) return;
      if (error) {
        attempt += 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
        console.error(
          `[NotificationsProvider] pizzerias load error (retry in ${delay}ms):`,
          error
        );
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id || seenOrderIds.current.has(row.id)) return;
          if (
            pizzeriaIds !== "__all__" &&
            !pizzeriaIds.includes(row.tenant_id)
          ) {
            return;
          }
          seenOrderIds.current.add(row.id);
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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pizzeriaIds]);

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

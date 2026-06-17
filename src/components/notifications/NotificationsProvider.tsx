import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { playSound, unlockAudio, isAudioBlocked } from "@/lib/notification-sounds";
import { TableCloseRequestPopup, type CloseRequest } from "./TableCloseRequestPopup";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

/**
 * Mounts global realtime subscriptions for the signed-in operator:
 *  - table_close_requests INSERT  → popup queue + close-request sound
 *  - orders INSERT                → toast + new-order sound
 * Also handles browser autoplay-unlock for audio.
 */
export function NotificationsProvider() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzeriaId, setPizzeriaId] = useState<string | null>(null);
  const [queue, setQueue] = useState<CloseRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const seenOrderIds = useRef<Set<string>>(new Set());

  // Resolve the operator's pizzeria(s). Super admins can listen to all by passing null filter.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setPizzeriaId(null);
        return;
      }
      if (isSuperAdmin) {
        setPizzeriaId("__all__");
        return;
      }
      const { data } = await supabase
        .from("pizzerias")
        .select("id")
        .eq("owner_id", user.id)
        .neq("status", "deleted")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!cancelled) setPizzeriaId(data?.id || null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, isSuperAdmin]);

  // Load any already-pending close requests on mount.
  useEffect(() => {
    if (!pizzeriaId) return;
    let cancelled = false;
    async function load() {
      let q = supabase
        .from("table_close_requests")
        .select("*")
        .in("status", ["pending", "viewed"])
        .order("requested_at", { ascending: true });
      if (pizzeriaId !== "__all__") q = q.eq("restaurant_id", pizzeriaId);
      const { data } = await q;
      if (cancelled || !data) return;
      setQueue((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...(data as CloseRequest[]).filter((r) => !ids.has(r.id as string))];
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pizzeriaId]);

  // Realtime: close requests
  useEffect(() => {
    if (!pizzeriaId) return;
    const channel = supabase
      .channel(`close-requests-${pizzeriaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "table_close_requests",
          ...(pizzeriaId !== "__all__" ? { filter: `restaurant_id=eq.${pizzeriaId}` } : {}),
        },
        (payload) => {
          const row = payload.new as CloseRequest;
          setQueue((prev) => (prev.find((r) => r.id === row.id) ? prev : [...prev, row]));
          playSound("close_request");
          toast.warning(`Mesa ${row.table_number} pediu para fechar a conta`, {
            description: row.customer_name ? `Cliente: ${row.customer_name}` : undefined,
          });
          if (isAudioBlocked()) setAudioBlocked(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "table_close_requests",
          ...(pizzeriaId !== "__all__" ? { filter: `restaurant_id=eq.${pizzeriaId}` } : {}),
        },
        (payload) => {
          const row = payload.new as CloseRequest;
          // Remove from queue if processed elsewhere
          if (["closed", "cancelled", "printed"].includes(row.status)) {
            setQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pizzeriaId]);

  // Realtime: new orders → sound + toast
  useEffect(() => {
    if (!pizzeriaId) return;
    const channel = supabase
      .channel(`orders-notify-${pizzeriaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          ...(pizzeriaId !== "__all__" ? { filter: `tenant_id=eq.${pizzeriaId}` } : {}),
        },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id || seenOrderIds.current.has(row.id)) return;
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
  }, [pizzeriaId]);

  // Detect browser audio block
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

  const visibleQueue = queue.filter((r) => !dismissed.has(r.id));

  return (
    <>
      {audioBlocked && (
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
      )}
      {visibleQueue.length > 0 && (
        <TableCloseRequestPopup
          queue={visibleQueue}
          onDismiss={(id) => setDismissed((p) => new Set(p).add(id))}
          onProcessed={(id) => setQueue((p) => p.filter((r) => r.id !== id))}
        />
      )}
    </>
  );
}

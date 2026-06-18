import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { playSound, unlockAudio, isAudioBlocked } from "@/lib/notification-sounds";
import { TableCloseRequestPopup, type CloseRequest } from "./TableCloseRequestPopup";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

/**
 * Global listener: close-requests + new orders.
 * - Supports owners with multiple pizzerias (filters client-side).
 * - Loads pending requests on mount AND polls every 15s as a belt-and-suspenders
 *   fallback in case Realtime drops.
 * - Logs every received event for diagnostics.
 */
export function NotificationsProvider() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzeriaIds, setPizzeriaIds] = useState<string[] | "__all__" | null>(null);
  const [queue, setQueue] = useState<CloseRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const seenOrderIds = useRef<Set<string>>(new Set());
  const seenRequestIds = useRef<Set<string>>(new Set());

  // Resolve owned pizzerias (all of them).
  useEffect(() => {
    let cancelled = false;
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
        console.error("[NotificationsProvider] pizzerias load error:", error);
        setPizzeriaIds([]);
        return;
      }
      const ids = (data || []).map((p: any) => p.id);
      console.log("[NotificationsProvider] tracking pizzerias:", ids);
      setPizzeriaIds(ids);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, isSuperAdmin]);

  // Fetch any pending/viewed close requests and merge into queue.
  async function fetchPending() {
    if (!pizzeriaIds) return;
    let q = supabase
      .from("table_close_requests")
      .select("*")
      .in("status", ["pending", "viewed"])
      .order("requested_at", { ascending: true });
    if (pizzeriaIds !== "__all__") {
      if (pizzeriaIds.length === 0) return;
      q = q.in("restaurant_id", pizzeriaIds);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[NotificationsProvider] fetchPending error:", error);
      return;
    }
    console.log("[NotificationsProvider] pending close requests:", data?.length || 0);
    if (!data || data.length === 0) return;
    setQueue((prev) => {
      const ids = new Set(prev.map((r) => r.id));
      const incoming = (data as unknown as CloseRequest[]).filter(
        (r) => r.id && !ids.has(r.id)
      );
      // Play sound only if there were truly new ones we hadn't seen before.
      const trulyNew = incoming.filter((r) => !seenRequestIds.current.has(r.id));
      trulyNew.forEach((r) => seenRequestIds.current.add(r.id));
      if (trulyNew.length > 0) {
        playSound("close_request");
        if (isAudioBlocked()) setAudioBlocked(true);
      }
      return [...prev, ...incoming];
    });
  }

  // Initial load + polling fallback every 15s.
  useEffect(() => {
    if (!pizzeriaIds) return;
    void fetchPending();
    const t = setInterval(() => void fetchPending(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaIds]);

  // Realtime: close requests (no server-side filter — we filter in JS to support multi-pizzeria)
  useEffect(() => {
    if (!pizzeriaIds) return;
    const channel = supabase
      .channel("close-requests-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests INSERT:", row);
          if (
            pizzeriaIds !== "__all__" &&
            !pizzeriaIds.includes(row.restaurant_id)
          ) {
            console.log("[Realtime] ignored — not our pizzeria");
            return;
          }
          setQueue((prev) => (prev.find((r) => r.id === row.id) ? prev : [...prev, row]));
          if (!seenRequestIds.current.has(row.id)) {
            seenRequestIds.current.add(row.id);
            playSound("close_request");
            toast.warning(`Mesa ${row.table_number} pediu para fechar a conta`, {
              description: row.customer_name ? `Cliente: ${row.customer_name}` : undefined,
            });
            if (isAudioBlocked()) setAudioBlocked(true);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests UPDATE:", row.id, row.status);
          if (["closed", "cancelled", "printed"].includes(row.status)) {
            setQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] close-requests channel:", status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pizzeriaIds]);

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

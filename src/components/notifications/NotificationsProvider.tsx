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

  // Load every PENDING close request currently in the database and put
  // it on the popup queue. Runs on mount, on reconnect, and every 15s.
  // No startup-time cutoff — a pending request is always shown until an
  // operator explicitly dismisses (dismissed set) or the DB flips it.
  async function loadPending() {
    if (!pizzeriaIds) return;
    let q = supabase
      .from("table_close_requests")
      .select("id, restaurant_id, table_id, table_number, session_id, customer_name, status, requested_at")
      .in("status", ["pending", "viewed"])
      .order("requested_at", { ascending: true })
      .limit(50);
    if (pizzeriaIds !== "__all__") {
      if (pizzeriaIds.length === 0) return;
      q = q.in("restaurant_id", pizzeriaIds);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[NotificationsProvider] loadPending error:", error);
      return;
    }
    const rows = (data || []) as CloseRequest[];
    if (rows.length === 0) {
      // Prune anything still queued but no longer pending.
      setQueue((prev) => prev.filter((r) => rows.find((x) => x.id === r.id)));
      return;
    }
    setQueue((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r);
      // Drop queued rows that no longer come back as pending/viewed
      for (const id of byId.keys()) {
        if (!rows.find((r) => r.id === id) && !prev.find((r) => r.id === id)) {
          byId.delete(id);
        }
      }
      return Array.from(byId.values());
    });
    console.log("[NotificationsProvider] pending refreshed:", rows.length);
  }

  useEffect(() => {
    if (!pizzeriaIds) return;
    void loadPending();
    const t = setInterval(() => void loadPending(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaIds]);

  // Realtime: close requests. Any INSERT with status pending/viewed opens
  // the popup. No startup guard, no historical filter — reconnects and
  // fresh reloads always recover pending requests via loadPending().
  useEffect(() => {
    if (!pizzeriaIds) return;
    const channel = supabase
      .channel("close-requests-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests INSERT:", row.id, row.status);
          if (row.status !== "pending" && row.status !== "viewed") return;
          if (pizzeriaIds !== "__all__" && !pizzeriaIds.includes(row.restaurant_id)) {
            console.log("[Realtime] ignored — not our pizzeria");
            return;
          }
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
        { event: "UPDATE", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests UPDATE:", row.id, row.status);
          if (!["pending", "viewed"].includes(row.status)) {
            setQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] close-requests channel:", status);
        // On (re)connect, always resync pending so nothing gets missed.
        if (status === "SUBSCRIBED") void loadPending();
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

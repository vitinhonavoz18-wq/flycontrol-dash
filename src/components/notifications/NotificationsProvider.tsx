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
  // Hard cutoff: only requests created strictly AFTER FlyControl loaded are
  // allowed to spawn a popup. Historical pending rows are never resurrected.
  const appStartTime = useRef<string>(new Date().toISOString());

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

  // Polling = counters/health only. NEVER opens a popup. NEVER mutates the
  // queue. Popups are exclusively driven by realtime INSERT events arriving
  // after app start (see startup rule below).
  async function pollCounters() {
    if (!pizzeriaIds) return;
    let q = supabase
      .from("table_close_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (pizzeriaIds !== "__all__") {
      if (pizzeriaIds.length === 0) return;
      q = q.in("restaurant_id", pizzeriaIds);
    }
    const { count, error } = await q;
    if (error) {
      console.error("[NotificationsProvider] pollCounters error:", error);
      return;
    }
    console.log("[NotificationsProvider] pending count (poll, counters only):", count ?? 0);
    // Intentionally do NOT touch queue, dismissed, or seenRequestIds here.
  }

  // Counter polling every 30s. Does not spawn popups.
  useEffect(() => {
    if (!pizzeriaIds) return;
    void pollCounters();
    const t = setInterval(() => void pollCounters(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaIds]);

  // Realtime: close requests. Popups open ONLY on INSERT events for rows
  // created strictly after the app started, and only once per request_id.
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

          // Strict dedup — once we've seen this request_id, never again.
          if (seenRequestIds.current.has(row.id)) {
            console.log("[Realtime] dedup — request already shown:", row.id);
            return;
          }
          // Status rule: only 'pending' rows open a popup.
          if (row.status !== "pending") return;
          // Tenant scope.
          if (pizzeriaIds !== "__all__" && !pizzeriaIds.includes(row.restaurant_id)) {
            console.log("[Realtime] ignored — not our pizzeria");
            return;
          }
          // Startup rule: ignore anything created at or before app start.
          // Guards against Realtime backfill / reconnect replay of old rows.
          const createdAt = (row as any).created_at || row.requested_at;
          if (createdAt && createdAt <= appStartTime.current) {
            console.log("[Realtime] ignored — historical row (pre-startup):", row.id);
            return;
          }

          seenRequestIds.current.add(row.id);
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
          // Anything that isn't 'pending' anymore must be removed from the
          // visible queue and marked as seen so polling cannot re-add it.
          if (row.status !== "pending") {
            seenRequestIds.current.add(row.id);
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

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { playSound, unlockAudio, isAudioBlocked } from "@/lib/notification-sounds";
import { TableCloseRequestPopup, type CloseRequest } from "./TableCloseRequestPopup";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

// Routes that must NEVER receive customer close-request popups.
// The Waiter Portal is a separate surface with its own auth; even if an
// operator session is present in the same browser, the popup must not appear.
const POPUP_FORBIDDEN_PREFIXES = ["/waiter-portal", "/waiter-login", "/print"];

/**
 * Global listener: close-requests + new orders.
 * - Supports owners with multiple pizzerias (filters client-side).
 * - Loads pending requests on mount AND polls every 15s as a belt-and-suspenders
 *   fallback in case Realtime drops.
 * - Logs every received event for diagnostics.
 */
export function NotificationsProvider() {
  const { user, isSuperAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isForbiddenRoute = POPUP_FORBIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
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

  // Recovery fetch: pulls every pending close request the operator owns and
  // merges it into the queue. Runs on mount (after pizzeriaIds resolves) and
  // on every Realtime (re)subscribe. This is the ONLY safety net against
  // fire-and-forget Realtime losing INSERTs delivered outside the subscribed
  // window (cold start, tab closed, socket drop, browser refresh).
  // NOT polled — no timers, no intervals.
  async function recoverPending(ids: string[] | "__all__") {
    let query = supabase
      .from("table_close_requests")
      .select("id, restaurant_id, table_id, table_number, session_id, customer_name, status, requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (ids !== "__all__") {
      if (ids.length === 0) return;
      query = query.in("restaurant_id", ids);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[NotificationsProvider] recoverPending error:", error);
      return;
    }
    const rows = (data || []) as CloseRequest[];
    if (rows.length === 0) return;
    console.log("[NotificationsProvider] recovered pending:", rows.map((r) => r.id));
    setQueue((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const merged = [...prev];
      for (const r of rows) if (!seen.has(r.id)) merged.push(r);
      return merged;
    });
  }


  // Realtime: close requests. Any INSERT with status pending/viewed opens
  // the popup. Recovery runs on every SUBSCRIBED transition to cover any
  // events that occurred while the socket was down.
  useEffect(() => {
    if (!pizzeriaIds) return;
    // Startup recovery (before/at the same time the channel opens).
    void recoverPending(pizzeriaIds);

    const channel = supabase
      .channel("close-requests-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests INSERT:", row.id, row.status);
          if (row.status !== "pending") return;
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
          // Only terminal statuses close the popup. `viewed` / `printed` are
          // intermediate operator actions — the popup must remain visible so
          // the operator can still press "Finalizar Mesa".
          if (row.status === "completed" || row.status === "cancelled") {
            setQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] close-requests channel:", status);
        // Reconnection recovery: on every successful (re)subscribe, re-fetch
        // pending rows. Covers CHANNEL_ERROR / TIMED_OUT / CLOSED → rejoin
        // cycles where Realtime does not replay missed events.
        if (status === "SUBSCRIBED") {
          void recoverPending(pizzeriaIds);
        }
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
      {!isForbiddenRoute && visibleQueue.length > 0 && (
        <TableCloseRequestPopup
          queue={visibleQueue}
          onDismiss={(id) => setDismissed((p) => new Set(p).add(id))}
          onProcessed={(id) => setQueue((p) => p.filter((r) => r.id !== id))}
        />
      )}
    </>
  );
}

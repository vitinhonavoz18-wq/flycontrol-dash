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
  // Live ref so the Realtime callback (created once per user) always sees
  // the latest owned pizzerias without needing to tear down the channel.
  const pizzeriaIdsRef = useRef<string[] | "__all__" | null>(null);
  useEffect(() => {
    pizzeriaIdsRef.current = pizzeriaIds;
  }, [pizzeriaIds]);

  // Resolve owned pizzerias with automatic retry on failure. The provider
  // MUST NOT stay stuck with pizzeriaIds == null after login.
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
      console.log("[NotificationsProvider] tracking pizzerias:", ids);
      setPizzeriaIds(ids);
    }
    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, isSuperAdmin]);

  // Recovery fetch: pulls every pending close request the operator owns and
  // merges it into the queue. Runs after auth resolves and on every Realtime
  // (re)subscribe. Only safety net for INSERTs missed while the socket was
  // down. NOT polled.
  async function recoverPending(ids: string[] | "__all__" | null) {
    if (!ids) return;
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

  // Once pizzeriaIds resolves after login, run recovery exactly once per
  // (user, ids) transition — independent of the Realtime subscribe cycle.
  useEffect(() => {
    if (!pizzeriaIds) return;
    void recoverPending(pizzeriaIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaIds]);

  // Realtime: close requests. Subscribes as soon as the user is authenticated
  // — does NOT wait for pizzeriaIds so a slow/failed pizzerias fetch cannot
  // prevent the channel from ever opening. The INSERT filter reads the live
  // ref, so it starts working the moment pizzeriaIds resolves.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("close-requests-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "table_close_requests" },
        (payload) => {
          const row = payload.new as CloseRequest;
          console.log("[Realtime] table_close_requests INSERT:", row.id, row.status);
          if (row.status !== "pending") return;
          const ids = pizzeriaIdsRef.current;
          if (ids && ids !== "__all__" && !ids.includes(row.restaurant_id)) {
            console.log("[Realtime] ignored — not our pizzeria");
            return;
          }
          // If ids not resolved yet, accept the row optimistically; the
          // recovery fetch will reconcile against DB truth.
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
          if (row.status === "completed" || row.status === "cancelled") {
            setQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] close-requests channel:", status);
        if (status === "SUBSCRIBED") {
          void recoverPending(pizzeriaIdsRef.current);
        }
        // Auto-reconnect: on terminal socket states, drop the current
        // channel; the effect cleanup + user-dep will not re-run on its
        // own, so schedule a rejoin using the same channel name.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setTimeout(() => {
            // Guard against duplicate subscriptions: removeChannel is
            // idempotent, and re-subscribing on the same channel object
            // is a no-op if already SUBSCRIBED.
            try {
              channel.subscribe();
            } catch (e) {
              console.warn("[Realtime] rejoin failed:", e);
            }
          }, 2000);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);


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

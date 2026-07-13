import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bell, ClipboardList, DollarSign, HandPlatter, PackageCheck, PlusCircle, Utensils, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { playSound, unlockAudio, type SoundEvent } from "@/lib/notification-sounds";
import { WaiterCloseRequestPopup, type WaiterCloseAlert } from "./WaiterCloseRequestPopup";

type NotifType =
  | "new_order"
  | "new_item"
  | "order_ready"
  | "bill_request"
  | "close_request"
  | "customer_call"
  | "customer_request";

type WaiterNotif = {
  id: string;
  type: NotifType;
  sessionId: string;
  tableNumber: string;
  customerName?: string | null;
  at: number;
  meta?: Record<string, any>;
};

type AssignedSession = {
  id: string;
  table_number: string;
  customer_name: string | null;
};

const LABELS: Record<NotifType, string> = {
  new_order: "Novo pedido",
  new_item: "Novo item adicionado",
  order_ready: "Pedido pronto",
  bill_request: "Pedido de conta",
  close_request: "Pedido de fechamento",
  customer_call: "Cliente chamou garçom",
  customer_request: "Solicitação do cliente",
};

const SOUND_FOR: Record<NotifType, SoundEvent> = {
  new_order: "new_order",
  new_item: "new_item",
  order_ready: "order_ready",
  bill_request: "bill_request",
  close_request: "close_request",
  customer_call: "customer_call",
  customer_request: "customer_call",
};

const ICON_FOR: Record<NotifType, React.ComponentType<{ className?: string }>> = {
  new_order: Utensils,
  new_item: PlusCircle,
  order_ready: PackageCheck,
  bill_request: DollarSign,
  close_request: DollarSign,
  customer_call: HandPlatter,
  customer_request: ClipboardList,
};

const READY_STATUSES = new Set([
  "pronto", "ready", "pronto para entrega", "pronto_para_entrega", "ready_to_deliver",
]);

const DONE_STATUSES = new Set([
  "cancelado", "cancelled", "canceled",
  "entregue", "delivered", "finalizado", "completed",
]);

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function WaiterNotificationCenter({
  token,
  tenantId,
  waiterId,
  onOpenTable,
}: {
  token: string;
  tenantId: string;
  waiterId: string;
  onOpenTable?: () => void;
}) {
  const [items, setItems] = useState<WaiterNotif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Maps kept in refs so realtime callbacks always see latest values
  const sessionsRef = useRef<Map<string, AssignedSession>>(new Map());
  const orderToSessionRef = useRef<Map<string, string>>(new Map());
  const orderStatusRef = useRef<Map<string, string>>(new Map());
  const orderItemCountRef = useRef<Map<string, number>>(new Map());
  const appStartedAt = useRef(Date.now());
  const seenIds = useRef<Set<string>>(new Set());

  // ---- Initial fetch of my assigned sessions + link maps ----
  const loadContext = useCallback(async () => {
    // Sessions assigned to this waiter (open) — used to filter incoming events
    const { data: sess } = await supabase
      .from("table_sessions")
      .select("id, table_number, customer_name, status")
      .eq("restaurant_id", tenantId)
      .eq("waiter_id", waiterId)
      .eq("status", "open");
    const map = new Map<string, AssignedSession>();
    (sess || []).forEach((s: any) => map.set(s.id, {
      id: s.id, table_number: String(s.table_number || ""), customer_name: s.customer_name || null,
    }));
    sessionsRef.current = map;

    if (map.size > 0) {
      const { data: links } = await supabase
        .from("table_session_orders")
        .select("order_id, table_session_id")
        .in("table_session_id", Array.from(map.keys()));
      const om = new Map<string, string>();
      (links || []).forEach((l: any) => om.set(l.order_id, l.table_session_id));
      orderToSessionRef.current = om;

      if (om.size > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, status, items")
          .in("id", Array.from(om.keys()));
        const sm = new Map<string, string>();
        const im = new Map<string, number>();
        (orders || []).forEach((o: any) => {
          sm.set(o.id, String(o.status || ""));
          im.set(o.id, Array.isArray(o.items) ? o.items.length : 0);
        });
        orderStatusRef.current = sm;
        orderItemCountRef.current = im;
      }
    }
  }, [tenantId, waiterId]);

  // ---- Add a notification ----
  const push = useCallback((n: Omit<WaiterNotif, "id" | "at">) => {
    const id = `${n.type}:${n.sessionId}:${n.meta?.order_id ?? ""}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    if (seenIds.current.has(id)) return;
    seenIds.current.add(id);
    const notif: WaiterNotif = { ...n, id, at: Date.now() };
    setItems(prev => [notif, ...prev].slice(0, 100));
    setUnread(u => u + 1);
    try { playSound(SOUND_FOR[n.type]); } catch {}
    toast(LABELS[n.type], {
      description: `Mesa ${n.tableNumber}${n.customerName ? ` · ${n.customerName}` : ""}`,
      action: onOpenTable ? { label: "Abrir", onClick: onOpenTable } : undefined,
    });
  }, [onOpenTable]);

  // ---- Realtime wiring ----
  useEffect(() => {
    let cancelled = false;
    void loadContext();

    const ch = supabase.channel(`waiter-notif-${waiterId}`)
      // Session assignment changes — refresh context so we track the right sessions
      .on("postgres_changes",
        { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` },
        async (payload) => {
          if (cancelled) return;
          await loadContext();
          const row: any = payload.new || payload.old;
          if (!row) return;
          // If a NEW session was just assigned to me, surface it as a call-to-action.
          if (payload.eventType === "UPDATE" &&
              payload.new?.waiter_id === waiterId &&
              payload.old?.waiter_id !== waiterId &&
              payload.new?.status === "open") {
            push({
              type: "customer_request",
              sessionId: payload.new.id,
              tableNumber: String(payload.new.table_number || ""),
              customerName: payload.new.customer_name,
              meta: { reason: "assigned_to_me" },
            });
          }
        })
      // Order link inserts — a new order attached to some session
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "table_session_orders" },
        async (payload) => {
          if (cancelled) return;
          const link: any = payload.new;
          const sess = sessionsRef.current.get(link.table_session_id);
          if (!sess) return; // Not my table
          orderToSessionRef.current.set(link.order_id, link.table_session_id);
          // Fetch the order details
          const { data: order } = await supabase
            .from("orders").select("id, status, items, customer_name, created_at")
            .eq("id", link.order_id).maybeSingle();
          if (!order) return;
          orderStatusRef.current.set(order.id, String(order.status || ""));
          orderItemCountRef.current.set(order.id, Array.isArray(order.items) ? order.items.length : 0);
          // Only surface orders created after the app opened (avoid history noise)
          if (new Date(order.created_at).getTime() < appStartedAt.current - 5000) return;
          push({
            type: "new_order",
            sessionId: sess.id,
            tableNumber: sess.table_number,
            customerName: order.customer_name || sess.customer_name,
            meta: { order_id: order.id },
          });
        })
      // Order updates — status change (ready) or items grew (new item added)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          if (cancelled) return;
          const o: any = payload.new;
          const sessionId = orderToSessionRef.current.get(o.id);
          if (!sessionId) return;
          const sess = sessionsRef.current.get(sessionId);
          if (!sess) return;

          const prevStatus = orderStatusRef.current.get(o.id) || "";
          const nextStatus = String(o.status || "");
          orderStatusRef.current.set(o.id, nextStatus);

          if (READY_STATUSES.has(nextStatus.toLowerCase()) &&
              !READY_STATUSES.has(prevStatus.toLowerCase()) &&
              !DONE_STATUSES.has(prevStatus.toLowerCase())) {
            push({
              type: "order_ready",
              sessionId, tableNumber: sess.table_number,
              customerName: o.customer_name || sess.customer_name,
              meta: { order_id: o.id },
            });
          }

          const prevCount = orderItemCountRef.current.get(o.id) ?? 0;
          const nextCount = Array.isArray(o.items) ? o.items.length : 0;
          orderItemCountRef.current.set(o.id, nextCount);
          if (nextCount > prevCount && prevCount > 0) {
            push({
              type: "new_item",
              sessionId, tableNumber: sess.table_number,
              customerName: o.customer_name || sess.customer_name,
              meta: { order_id: o.id, added: nextCount - prevCount },
            });
          }
        })
      // Close/bill requests are handled EXCLUSIVELY by the Dashboard's
      // NotificationsProvider (src/components/notifications/NotificationsProvider.tsx).
      // The Waiter Portal must not subscribe to table_close_requests, must not
      // push those events into its notification queue, must not play a sound
      // for them, and must not render TableCloseRequestPopup.
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [tenantId, waiterId, loadContext, push]);

  const grouped = useMemo(() => items, [items]);

  function openAndClear() {
    setOpen(true);
    setUnread(0);
    // Try to unlock audio on user gesture so future sounds play reliably.
    void unlockAudio();
  }

  function clearAll() { setItems([]); seenIds.current.clear(); }

  function handleTap(n: WaiterNotif) {
    setOpen(false);
    onOpenTable?.();
    // Bubble a custom event so tabs/lists can highlight the target session.
    window.dispatchEvent(new CustomEvent("waiter-open-session", {
      detail: { sessionId: n.sessionId, tableNumber: n.tableNumber },
    }));
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (v) setUnread(0); }}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" onClick={openAndClear}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-[10px]"
                   variant="destructive">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            <span>Notificações</span>
            {grouped.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto">
          {grouped.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação por enquanto.
              <div className="text-xs mt-2">Você será avisado assim que algo acontecer em uma mesa sua.</div>
            </div>
          ) : (
            <ul className="divide-y">
              {grouped.map((n) => {
                const Icon = ICON_FOR[n.type];
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleTap(n)}
                      className="w-full text-left px-4 py-3 hover:bg-accent/50 transition flex gap-3 items-start"
                    >
                      <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 grid place-items-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{LABELS[n.type]}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            há {timeAgo(n.at)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <b className="text-foreground">Mesa {n.tableNumber}</b>
                          {n.customerName ? <> · {n.customerName}</> : null}
                          <> · {new Date(n.at).toLocaleTimeString("pt-BR")}</>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-3 border-t text-[11px] text-muted-foreground text-center">
          Notificações em tempo real das suas mesas
        </div>
      </SheetContent>
    </Sheet>
  );
}

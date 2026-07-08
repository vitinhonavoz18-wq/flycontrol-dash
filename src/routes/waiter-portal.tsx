import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, LogOut, UtensilsCrossed, RefreshCw, ScanLine,
  LayoutGrid, Bell, Receipt, History, User, Clock, Users,
  DollarSign, BellRing, ClipboardList, TrendingUp, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { getWaiterSession, clearWaiterSession } from "@/lib/waiterSession";
import { WaiterNotificationCenter } from "@/components/waiter/WaiterNotificationCenter";
import { ScanTableSheet } from "@/components/waiter/ScanTableSheet";
import {
  listMyAssignedSessions, listMyPendingOrders,
  listMyAssignedCloseRequests, getWaiterDashboard,
  waiterRequestClose,
} from "@/lib/waiterAuth.functions";

export const Route = createFileRoute("/waiter-portal")({ component: WaiterPortal });

const fmtBRL = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Tab = "tables" | "notifications" | "orders" | "history" | "profile";

function WaiterPortal() {
  const nav = useNavigate();
  const [sess, setSess] = useState(() => getWaiterSession());
  const [tab, setTab] = useState<Tab>("tables");
  const [scanOpen, setScanOpen] = useState(false);
  const [highlightTable, setHighlightTable] = useState<string | null>(null);

  useEffect(() => {
    const s = getWaiterSession();
    if (!s) { nav({ to: "/waiter-login" }); return; }
    setSess(s);
  }, [nav]);

  // Notification taps jump to Tables tab and highlight the target session
  useEffect(() => {
    function onOpenSession(e: any) {
      const tn = e?.detail?.tableNumber;
      if (tn) { setHighlightTable(String(tn)); setTab("tables"); }
    }
    window.addEventListener("waiter-open-session", onOpenSession);
    return () => window.removeEventListener("waiter-open-session", onOpenSession);
  }, []);

  if (!sess) return null;
  function logout() { clearWaiterSession(); nav({ to: "/waiter-login" }); }

  const ctx = { token: sess.token, tenantId: sess.waiter.tenantId, waiterId: sess.waiter.id };

  function handleScan(value: string) {
    // Extract a table hint from either a full URL or a bare code
    let hint = value.trim();
    try {
      const url = new URL(hint);
      hint = url.searchParams.get("table") || url.searchParams.get("t") ||
             url.pathname.split("/").filter(Boolean).pop() || hint;
    } catch { /* not a URL */ }
    setHighlightTable(hint);
    setTab("tables");
    toast.success(`Procurando mesa ${hint}…`);
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/20 pb-24">
      {/* Sticky mobile header */}
      <header className="sticky top-0 z-30 backdrop-blur-lg bg-background/80 border-b">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center shadow-sm">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight truncate">{sess.waiter.fullName}</h1>
              <p className="text-[11px] text-muted-foreground">Portal do Garçom</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <WaiterNotificationCenter
              token={sess.token}
              tenantId={sess.waiter.tenantId}
              waiterId={sess.waiter.id}
              onOpenTable={() => setTab("tables")}
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-3 space-y-3 animate-fade-in">
        {tab === "tables" && (
          <MyTablesTab {...ctx} highlight={highlightTable} onClearHighlight={() => setHighlightTable(null)} />
        )}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "orders" && <PendingOrdersTab {...ctx} />}
        {tab === "history" && <HistoryTab {...ctx} />}
        {tab === "profile" && <ProfileTab sess={sess} onLogout={logout} />}
      </main>

      {/* Floating "Scan Table" button */}
      <button
        onClick={() => setScanOpen(true)}
        aria-label="Escanear mesa"
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 grid place-items-center hover:scale-105 active:scale-95 transition-transform"
      >
        <ScanLine className="h-6 w-6" />
      </button>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-lg safe-bottom">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          <TabBtn icon={<LayoutGrid className="h-5 w-5" />} label="Mesas" active={tab === "tables"} onClick={() => setTab("tables")} />
          <TabBtn icon={<Bell className="h-5 w-5" />} label="Alertas" active={tab === "notifications"} onClick={() => setTab("notifications")} />
          <TabBtn icon={<Receipt className="h-5 w-5" />} label="Pedidos" active={tab === "orders"} onClick={() => setTab("orders")} />
          <TabBtn icon={<History className="h-5 w-5" />} label="Histórico" active={tab === "history"} onClick={() => setTab("history")} />
          <TabBtn icon={<User className="h-5 w-5" />} label="Perfil" active={tab === "profile"} onClick={() => setTab("profile")} />
        </div>
      </nav>

      <ScanTableSheet open={scanOpen} onOpenChange={setScanOpen} onDetected={handleScan} />
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className={`transition-transform ${active ? "scale-110" : ""}`}>{icon}</div>
      <span>{label}</span>
    </button>
  );
}

// ============================================================
// MY TABLES
// ============================================================
function MyTablesTab({ token, tenantId, highlight, onClearHighlight }: {
  token: string; tenantId: string; waiterId: string;
  highlight: string | null; onClearHighlight: () => void;
}) {
  const listSess = useServerFn(listMyAssignedSessions);
  const listPending = useServerFn(listMyPendingOrders);
  const listReq = useServerFn(listMyAssignedCloseRequests);
  const reqClose = useServerFn(waiterRequestClose);
  const [rows, setRows] = useState<any[]>([]);
  const [pendingBySession, setPendingBySession] = useState<Map<string, number>>(new Map());
  const [reqBySession, setReqBySession] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ss, po, rq] = await Promise.all([
        listSess({ data: { token } }) as Promise<any[]>,
        listPending({ data: { token } }) as Promise<any[]>,
        listReq({ data: { token } }) as Promise<any[]>,
      ]);
      setRows(ss || []);
      const pm = new Map<string, number>();
      (po || []).forEach((o: any) => {
        const items = Array.isArray(o.items) ? o.items.length : 0;
        pm.set(o.session_id, (pm.get(o.session_id) || 0) + items);
      });
      setPendingBySession(pm);
      const rm = new Map<string, number>();
      (rq || []).forEach((r: any) => rm.set(r.session_id, (rm.get(r.session_id) || 0) + 1));
      setReqBySession(rm);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, listSess, listPending, listReq]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const ch = supabase.channel(`waiter-mytables-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "table_session_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` }, () => load())
      // table_close_requests is intentionally NOT subscribed here. Customer
      // close requests are owned exclusively by the Dashboard's
      // NotificationsProvider. The Waiter Portal must not receive, list,
      // render or process them.
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  async function handleClose(sessionId: string) {
    try {
      const r = await reqClose({ data: { token, sessionId } });
      toast.success(r.status === "already_pending" ? "Fechamento já solicitado" : "Fechamento solicitado");
    } catch (e: any) { toast.error(e.message); }
  }

  const sorted = useMemo(() => {
    if (!highlight) return rows;
    const h = String(highlight);
    return [...rows].sort((a, b) => (String(a.table_number) === h ? -1 : String(b.table_number) === h ? 1 : 0));
  }, [rows, highlight]);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Minhas Mesas"
        subtitle={`${rows.length} aberta(s)`}
        action={<Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>}
      />
      {loading && rows.length === 0 ? <Loader /> :
        rows.length === 0 ? <Empty icon={<LayoutGrid className="h-8 w-8" />} title="Nenhuma mesa atribuída" text="Peça ao gerente para atribuir mesas a você." /> :
        <div className="space-y-3">
          {sorted.map((r) => (
            <TableCard
              key={r.id}
              r={r}
              now={now}
              pendingItems={pendingBySession.get(r.id) || 0}
              customerRequests={reqBySession.get(r.id) || 0}
              highlighted={highlight != null && String(r.table_number) === String(highlight)}
              onClose={handleClose}
              onDismissHighlight={onClearHighlight}
            />
          ))}
        </div>}
    </div>
  );
}

function TableCard({ r, now, pendingItems, customerRequests, highlighted, onClose, onDismissHighlight }: {
  r: any; now: number; pendingItems: number; customerRequests: number;
  highlighted?: boolean; onClose: (id: string) => void; onDismissHighlight?: () => void;
}) {
  const subtotal = Number(r.subtotal_amount || 0);
  const fee = Number(r.service_fee_amount || 0);
  const total = Number(r.total_amount || 0);
  const elapsedMs = Math.max(0, now - new Date(r.opened_at).getTime());
  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const elapsed = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}min`;

  const hot = customerRequests > 0;

  return (
    <div
      className={`rounded-2xl border bg-card shadow-sm overflow-hidden transition-all animate-scale-in ${
        highlighted ? "ring-2 ring-primary shadow-lg" : ""
      } ${hot ? "border-destructive/50" : ""}`}
      onAnimationEnd={() => highlighted && setTimeout(() => onDismissHighlight?.(), 2500)}
    >
      {/* Header stripe */}
      <div className={`px-4 py-3 flex items-center justify-between ${hot ? "bg-destructive/10" : "bg-primary/5"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center font-black text-lg ${
            hot ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
          }`}>
            {r.table_number}
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate">{r.table_name || `Mesa ${r.table_number}`}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {elapsed}
              {r.customer_name && <span className="truncate"> · {r.customer_name}</span>}
            </div>
          </div>
        </div>
        <Badge variant={hot ? "destructive" : "secondary"} className="text-[10px] uppercase shrink-0">
          {hot ? "Chamando" : r.status === "open" ? "Aberta" : r.status}
        </Badge>
      </div>

      {/* Total */}
      <div className="px-4 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Total atual</span>
          <span className="text-2xl font-black text-primary tabular-nums">{fmtBRL(total)}</span>
        </div>
        <div className="text-[11px] text-muted-foreground flex justify-between mt-0.5">
          <span>Subtotal {fmtBRL(subtotal)}</span>
          {r.service_fee_enabled && <span>Taxa {Number(r.service_fee_percent || 0)}% ({fmtBRL(fee)})</span>}
        </div>
      </div>

      {/* Indicators */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2 border-t mt-3">
        <Indicator icon={<ClipboardList className="h-4 w-4" />} label="Pedidos" value={r.orders_count} />
        <Indicator icon={<Receipt className="h-4 w-4" />} label="Itens" value={pendingItems} tone={pendingItems > 0 ? "warn" : undefined} />
        <Indicator icon={<MessageSquare className="h-4 w-4" />} label="Pedidos" value={customerRequests} tone={customerRequests > 0 ? "hot" : undefined} />
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        <Button size="lg" variant="outline" className="flex-1 h-12" onClick={() => window.dispatchEvent(new CustomEvent("waiter-focus-orders", { detail: { sessionId: r.id } }))}>
          <Receipt className="h-4 w-4 mr-2" /> Pedidos
        </Button>
        <Button size="lg" className="flex-1 h-12" onClick={() => onClose(r.id)}>
          <BellRing className="h-4 w-4 mr-2" /> Fechar
        </Button>
      </div>
    </div>
  );
}

function Indicator({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "warn" | "hot" }) {
  const color = tone === "hot" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <div className={`${color}`}>{icon}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

// ============================================================
// NOTIFICATIONS TAB
// ============================================================
function NotificationsTab() {
  return (
    <div className="space-y-3">
      <SectionHeader title="Notificações" subtitle="Alertas em tempo real" />
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center space-y-3">
          <div className="h-14 w-14 mx-auto rounded-full bg-primary/10 grid place-items-center">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-semibold">Central de Alertas</div>
            <p className="text-xs text-muted-foreground mt-1">
              Toque no sino no topo da tela para ver todos os avisos. Você também recebe
              notificações imediatas com som para cada evento das suas mesas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-left pt-3">
            <Legend label="Novo pedido" tone="primary" />
            <Legend label="Item adicionado" tone="primary" />
            <Legend label="Pedido pronto" tone="ok" />
            <Legend label="Chamado do cliente" tone="hot" />
            <Legend label="Pedido de conta" tone="hot" />
            <Legend label="Fechamento" tone="hot" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Legend({ label, tone }: { label: string; tone: "primary" | "ok" | "hot" }) {
  const cls = tone === "hot" ? "bg-destructive" : tone === "ok" ? "bg-emerald-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span>{label}</span>
    </div>
  );
}

// ============================================================
// PENDING ORDERS
// ============================================================
function PendingOrdersTab({ token, tenantId }: { token: string; tenantId: string; waiterId: string }) {
  const list = useServerFn(listMyPendingOrders);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await list({ data: { token } })) as any[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, list]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`waiter-pending-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_session_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  return (
    <div className="space-y-3">
      <SectionHeader title="Pedidos Pendentes" subtitle={`${rows.length} em andamento`}
        action={<Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>} />
      {loading && rows.length === 0 ? <Loader /> :
        rows.length === 0 ? <Empty icon={<Receipt className="h-8 w-8" />} title="Sem pedidos pendentes" text="Quando um pedido chegar em uma mesa sua, aparecerá aqui." /> :
        <div className="space-y-2">
          {rows.map((o: any) => (
            <div key={o.id} className="rounded-xl border bg-card p-3 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm">
                    #{o.order_number || o.id.slice(0, 6)}
                    {o.table_number && <span className="text-muted-foreground font-normal"> · Mesa {o.table_number}</span>}
                  </div>
                  {o.customer_name && <div className="text-xs text-muted-foreground truncate">{o.customer_name}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-semibold">{fmtBRL(o.total)}</div>
                  <Badge variant="outline" className="text-[10px] mt-0.5">{o.status}</Badge>
                </div>
              </div>
              {Array.isArray(o.items) && o.items.length > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {o.items.slice(0, 5).map((it: any, i: number) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {(it.qty ?? it.quantity ?? 1)}× {it.name || it.product_name || "Item"}
                    </li>
                  ))}
                  {o.items.length > 5 && <li className="italic">+{o.items.length - 5} itens…</li>}
                </ul>
              )}
            </div>
          ))}
        </div>}
    </div>
  );
}

// ============================================================
// HISTORY (closed sessions + today's KPIs)
// ============================================================
function HistoryTab({ token, tenantId }: { token: string; tenantId: string; waiterId: string }) {
  const listSess = useServerFn(listMyAssignedSessions);
  const dash = useServerFn(getWaiterDashboard);
  const [closed, setClosed] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sess, d] = await Promise.all([
        listSess({ data: { token, includeClosed: true } }) as Promise<any[]>,
        dash({ data: { token } }),
      ]);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      setClosed((sess || []).filter((s: any) => s.status === "closed" && s.closed_at && new Date(s.closed_at) >= startOfDay));
      setKpi(d);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, listSess, dash]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`waiter-history-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  return (
    <div className="space-y-3">
      <SectionHeader title="Histórico de Hoje" subtitle="Mesas fechadas e comissões" />
      {kpi && (
        <div className="grid grid-cols-3 gap-2">
          <MiniKpi icon={<DollarSign className="h-4 w-4" />} label="Vendas" value={fmtBRL(kpi.todaySales)} />
          <MiniKpi icon={<TrendingUp className="h-4 w-4" />} label="Comissão" value={fmtBRL(kpi.todayCommission)} />
          <MiniKpi icon={<Users className="h-4 w-4" />} label="Fechadas" value={String(kpi.todayClosedCount)} />
        </div>
      )}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Mesas fechadas hoje</CardTitle></CardHeader>
        <CardContent>
          {loading && closed.length === 0 ? <Loader /> :
            closed.length === 0 ? <Empty icon={<History className="h-8 w-8" />} title="Nada fechado hoje" text="As mesas fechadas do dia aparecerão aqui." /> :
            <ul className="divide-y">
              {closed.map((s: any) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{s.table_name || `Mesa ${s.table_number}`}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Fechada {s.closed_at ? new Date(s.closed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-semibold">{fmtBRL(s.total_amount)}</div>
                    <div className="text-[10px] text-muted-foreground">comissão {fmtBRL(s.service_fee_amount)}</div>
                  </div>
                </li>
              ))}
            </ul>}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">{icon}<span>{label}</span></div>
      <div className="text-base font-black mt-1 tabular-nums">{value}</div>
    </div>
  );
}

// ============================================================
// PROFILE
// ============================================================
function ProfileTab({ sess, onLogout }: { sess: any; onLogout: () => void }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Meu Perfil" />
      <Card className="rounded-2xl">
        <CardContent className="p-5 text-center space-y-3">
          <div className="h-20 w-20 mx-auto rounded-full bg-gradient-to-br from-primary to-primary/60 grid place-items-center shadow-lg">
            <User className="h-9 w-9 text-primary-foreground" />
          </div>
          <div>
            <div className="text-lg font-bold">{sess.waiter.fullName}</div>
            <div className="text-xs text-muted-foreground">Garçom</div>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-2 text-sm">
          <Row label="Sessão expira em" value={new Date(sess.expiresAt).toLocaleString("pt-BR")} />
          <Row label="ID interno" value={sess.waiter.id.slice(0, 8) + "…"} />
        </CardContent>
      </Card>
      <Button variant="destructive" size="lg" className="w-full h-12 rounded-2xl" onClick={onLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Sair
      </Button>
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Você só vê as mesas atribuídas a você. O gerente controla as atribuições.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b last:border-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}

// ============================================================
// UI helpers
// ============================================================
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      <div>
        <h2 className="text-lg font-black leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Loader() {
  return <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando…
  </div>;
}
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-8 text-center space-y-2">
        <div className="h-14 w-14 mx-auto rounded-full bg-muted grid place-items-center text-muted-foreground">{icon}</div>
        <div className="font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

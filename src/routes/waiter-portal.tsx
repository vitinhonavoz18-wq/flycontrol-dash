import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, LogOut, UtensilsCrossed, RefreshCw,
  LayoutDashboard, LayoutGrid, Receipt, BellRing, DollarSign,
  ClipboardList, Users, Clock, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { getWaiterSession, clearWaiterSession } from "@/lib/waiterSession";
import { WaiterNotificationCenter } from "@/components/waiter/WaiterNotificationCenter";
import {
  listMyAssignedSessions, listMyPendingOrders,
  listMyAssignedCloseRequests, getWaiterDashboard,
  waiterRequestClose,
} from "@/lib/waiterAuth.functions";

export const Route = createFileRoute("/waiter-portal")({ component: WaiterPortal });

const fmtBRL = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function WaiterPortal() {
  const nav = useNavigate();
  const [sess, setSess] = useState(() => getWaiterSession());
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    const s = getWaiterSession();
    if (!s) { nav({ to: "/waiter-login" }); return; }
    setSess(s);
  }, [nav]);

  if (!sess) return null;
  function logout() { clearWaiterSession(); nav({ to: "/waiter-login" }); }

  const ctx = { token: sess.token, tenantId: sess.waiter.tenantId, waiterId: sess.waiter.id };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 grid place-items-center">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Portal do Garçom</h1>
              <p className="text-xs text-muted-foreground">{sess.waiter.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <WaiterNotificationCenter
              token={sess.token}
              tenantId={sess.waiter.tenantId}
              waiterId={sess.waiter.id}
              onOpenTable={() => setTab("tables")}
            />
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-5 w-full h-auto">
            <TabsTrigger value="dashboard" className="flex-col gap-1 py-2 text-[10px] md:text-xs md:flex-row">
              <LayoutDashboard className="h-4 w-4" /><span>Painel</span>
            </TabsTrigger>
            <TabsTrigger value="tables" className="flex-col gap-1 py-2 text-[10px] md:text-xs md:flex-row">
              <LayoutGrid className="h-4 w-4" /><span>Mesas</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-col gap-1 py-2 text-[10px] md:text-xs md:flex-row">
              <Receipt className="h-4 w-4" /><span>Pedidos</span>
            </TabsTrigger>
            <TabsTrigger value="closures" className="flex-col gap-1 py-2 text-[10px] md:text-xs md:flex-row">
              <BellRing className="h-4 w-4" /><span>Fechar</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex-col gap-1 py-2 text-[10px] md:text-xs md:flex-row">
              <DollarSign className="h-4 w-4" /><span>Vendas</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4"><DashboardTab {...ctx} onGo={setTab} /></TabsContent>
          <TabsContent value="tables" className="mt-4"><MyTablesTab {...ctx} /></TabsContent>
          <TabsContent value="orders" className="mt-4"><PendingOrdersTab {...ctx} /></TabsContent>
          <TabsContent value="closures" className="mt-4"><ClosingRequestsTab {...ctx} /></TabsContent>
          <TabsContent value="sales" className="mt-4"><TodaySalesTab {...ctx} /></TabsContent>
        </Tabs>

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Você só vê as mesas atribuídas a você. O gerente controla as atribuições.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardTab({ token, tenantId, onGo }: { token: string; tenantId: string; waiterId: string; onGo: (t: string) => void }) {
  const load = useServerFn(getWaiterDashboard);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setData(await load({ data: { token } })); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, load]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: any change on my tenant's sessions / requests / linked orders triggers refresh
  useEffect(() => {
    const ch = supabase.channel(`waiter-dash-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "table_close_requests", filter: `restaurant_id=eq.${tenantId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "table_session_orders" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, refresh]);

  if (loading && !data) return <Loader />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Users className="h-4 w-4" />} label="Minhas mesas" value={String(data.openTablesCount)}
             hint={fmtBRL(data.openTablesTotal) + " em aberto"} onClick={() => onGo("tables")} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Pedidos pendentes" value={String(data.pendingOrders)}
             hint="em andamento" onClick={() => onGo("orders")} />
        <Kpi icon={<BellRing className="h-4 w-4" />} label="Fechamentos" value={String(data.pendingCloseRequests)}
             hint="a processar" onClick={() => onGo("closures")} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Vendas hoje" value={fmtBRL(data.todaySales)}
             hint={`${data.todayClosedCount} mesa(s)`} onClick={() => onGo("sales")} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumo do dia</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Mesas fechadas hoje" value={String(data.todayClosedCount)} />
          <Row label="Vendas (subtotal)" value={fmtBRL(data.todaySales)} />
          <Row label="Comissão acumulada hoje" value={fmtBRL(data.todayCommission)} strong />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, hint, onClick }: { icon: React.ReactNode; label: string; value: string; hint?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-lg border bg-card p-3 hover:bg-accent/50 transition">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b last:border-0 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}

// ============================================================
// MY TABLES — only sessions assigned to this waiter
// ============================================================
function MyTablesTab({ token, tenantId }: { token: string; tenantId: string; waiterId: string }) {
  const listSess = useServerFn(listMyAssignedSessions);
  const reqClose = useServerFn(waiterRequestClose);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await listSess({ data: { token } })) as any[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, listSess]);

  useEffect(() => { load(); }, [load]);

  // 1s ticker for elapsed time (UI only, no fetch)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime: sessions + linked orders + orders themselves — no polling
  useEffect(() => {
    const ch = supabase.channel(`waiter-mytables-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "table_session_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  async function handleRequestClose(sessionId: string) {
    try {
      const r = await reqClose({ data: { token, sessionId } });
      toast.success(r.status === "already_pending" ? "Já existe um pedido de fechamento" : "Fechamento solicitado");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Minhas mesas · resumo ao vivo</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? <Loader /> :
          rows.length === 0 ? <Empty text="Nenhuma mesa atribuída a você. Peça ao gerente para atribuir." /> :
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r: any) => <LiveTableCard key={r.id} r={r} now={now} onClose={handleRequestClose} />)}
          </div>}
      </CardContent>
    </Card>
  );
}

function LiveTableCard({ r, now, onClose }: { r: any; now: number; onClose: (id: string) => void }) {
  const subtotal = Number(r.subtotal_amount || 0);
  const fee = Number(r.service_fee_amount || 0);
  const discount = Number(r.discount_total || 0);
  const total = Number(r.total_amount || 0);
  const elapsedMs = Math.max(0, now - new Date(r.opened_at).getTime());
  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const s = Math.floor((elapsedMs % 60_000) / 1000);
  const elapsed = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{r.table_name || `Mesa ${r.table_number}`}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {elapsed} em aberto
            {r.customer_name && <> · {r.customer_name}</>}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
      </div>

      <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right font-mono">{fmtBRL(subtotal)}</dd>
        <dt className="text-muted-foreground">
          Taxa serviço{r.service_fee_enabled ? ` (${Number(r.service_fee_percent || 0)}%)` : ""}
        </dt>
        <dd className="text-right font-mono">{fmtBRL(fee)}</dd>
        <dt className="text-muted-foreground">Descontos</dt>
        <dd className="text-right font-mono">{discount > 0 ? `− ${fmtBRL(discount)}` : fmtBRL(0)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-mono font-bold text-primary">{fmtBRL(total)}</dd>
      </dl>

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
        <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {r.orders_count} pedido(s)</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.customers_count} cliente(s)</span>
        <Button size="sm" variant="default" onClick={() => onClose(r.id)}>
          <BellRing className="h-4 w-4 mr-1" /> Fechar
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// PENDING ORDERS — only orders inside my sessions
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Pedidos pendentes</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? <Loader /> :
          rows.length === 0 ? <Empty text="Sem pedidos pendentes nas suas mesas." /> :
          <ul className="divide-y">
            {rows.map((o: any) => (
              <li key={o.id} className="py-2">
                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <b>#{o.order_number || o.id.slice(0, 6)}</b>
                    {o.table_number && <span className="text-muted-foreground"> · Mesa {o.table_number}</span>}
                    {o.customer_name && <span className="text-muted-foreground"> · {o.customer_name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    <span className="font-mono text-sm">{fmtBRL(o.total)}</span>
                  </div>
                </div>
                {Array.isArray(o.items) && o.items.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {o.items.slice(0, 4).map((it: any, i: number) => (
                      <div key={i} className="flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" />
                        {(it.qty ?? it.quantity ?? 1)}× {it.name || it.product_name || "Item"}
                      </div>
                    ))}
                    {o.items.length > 4 && <div className="italic">+{o.items.length - 4} itens…</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// CLOSING REQUESTS — only requests for my sessions
// ============================================================
function ClosingRequestsTab({ token, tenantId }: { token: string; tenantId: string; waiterId: string }) {
  const list = useServerFn(listMyAssignedCloseRequests);
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
    const ch = supabase.channel(`waiter-closreq-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_close_requests", filter: `restaurant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Pedidos de fechamento</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? <Loader /> :
          rows.length === 0 ? <Empty text="Nenhum pedido de fechamento pendente nas suas mesas." /> :
          <ul className="divide-y">
            {rows.map((r: any) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold">Mesa {r.table_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.requested_at).toLocaleString("pt-BR")}
                    {r.customer_name && <> · {r.customer_name}</>}
                  </div>
                </div>
                <Badge variant={r.status === "pending" ? "default" : "outline"}>{r.status}</Badge>
              </li>
            ))}
          </ul>}
        <p className="text-xs text-muted-foreground mt-3">
          O fechamento efetivo é confirmado pelo gerente no painel principal.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TODAY'S SALES — closed sessions today + running commission
// ============================================================
function TodaySalesTab({ token, tenantId }: { token: string; tenantId: string; waiterId: string }) {
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
    const ch = supabase.channel(`waiter-sales-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  return (
    <div className="space-y-3">
      {kpi && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={<DollarSign className="h-4 w-4" />} label="Vendas hoje" value={fmtBRL(kpi.todaySales)} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Comissão hoje" value={fmtBRL(kpi.todayCommission)} />
          <Kpi icon={<Users className="h-4 w-4" />} label="Mesas fechadas" value={String(kpi.todayClosedCount)} />
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Mesas fechadas hoje</CardTitle></CardHeader>
        <CardContent>
          {loading && closed.length === 0 ? <Loader /> :
            closed.length === 0 ? <Empty text="Nenhuma mesa fechada hoje." /> :
            <ul className="divide-y">
              {closed.map((s: any) => (
                <li key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{s.table_name || `Mesa ${s.table_number}`}</div>
                    <div className="text-xs text-muted-foreground">
                      Fechada {s.closed_at ? new Date(s.closed_at).toLocaleTimeString("pt-BR") : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtBRL(s.total_amount)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      comissão {fmtBRL(s.service_fee_amount)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function Loader() {
  return <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando…
  </div>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>;
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, LogOut, UtensilsCrossed, UserCheck, RefreshCw,
  LayoutGrid, Receipt, BellRing, Wallet, Plus, ChevronRight, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { getWaiterSession, clearWaiterSession } from "@/lib/waiterSession";
import {
  claimTableSession,
  listMyTenantSessions, listAvailableTables, openTableAsWaiter,
  listSessionOrders, waiterRequestClose, listMyCloseRequests, listMyCommissions,
} from "@/lib/waiterAuth.functions";

export const Route = createFileRoute("/waiter-portal")({ component: WaiterPortal });

const fmtBRL = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type SessRow = {
  id: string; table_number: string; table_name: string | null;
  status: string; total_amount: number; subtotal_amount: number;
  service_fee_amount: number; service_fee_enabled: boolean;
  opened_at: string; closed_at: string | null; waiter_id: string | null;
  waiter?: { full_name: string } | null;
};

function WaiterPortal() {
  const nav = useNavigate();
  const [sess, setSess] = useState(() => getWaiterSession());
  const [tab, setTab] = useState("tables");

  useEffect(() => {
    const s = getWaiterSession();
    if (!s) { nav({ to: "/waiter-login" }); return; }
    setSess(s);
  }, [nav]);

  if (!sess) return null;

  function logout() { clearWaiterSession(); nav({ to: "/waiter-login" }); }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center">
              <UtensilsCrossed className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Portal do Garçom</h1>
              <p className="text-sm text-muted-foreground">{sess.waiter.fullName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="tables"><LayoutGrid className="h-4 w-4 mr-1" />Mesas</TabsTrigger>
            <TabsTrigger value="orders"><Receipt className="h-4 w-4 mr-1" />Pedidos</TabsTrigger>
            <TabsTrigger value="closures"><BellRing className="h-4 w-4 mr-1" />Fechamentos</TabsTrigger>
            <TabsTrigger value="commissions"><Wallet className="h-4 w-4 mr-1" />Comissões</TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="mt-4"><TablesTab token={sess.token} waiterId={sess.waiter.id} tenantId={sess.waiter.tenantId} /></TabsContent>
          <TabsContent value="orders" className="mt-4"><OrdersTab token={sess.token} waiterId={sess.waiter.id} tenantId={sess.waiter.tenantId} /></TabsContent>
          <TabsContent value="closures" className="mt-4"><ClosuresTab token={sess.token} tenantId={sess.waiter.tenantId} /></TabsContent>
          <TabsContent value="commissions" className="mt-4"><CommissionsTab token={sess.token} /></TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center">
          Todas as ações são registradas com seu nome e sincronizadas em tempo real com o painel do administrador.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TABLES
// ============================================================
function TablesTab({ token, waiterId, tenantId }: { token: string; waiterId: string; tenantId: string }) {
  const listSess = useServerFn(listMyTenantSessions);
  const listAvail = useServerFn(listAvailableTables);
  const openTbl = useServerFn(openTableAsWaiter);
  const claim = useServerFn(claimTableSession);

  const [rows, setRows] = useState<SessRow[]>([]);
  const [avail, setAvail] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDlg, setOpenDlg] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        listSess({ data: { token } }),
        listAvail({ data: { token } }),
      ]);
      setRows(s as SessRow[]);
      setAvail(a as any[]);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, listSess, listAvail]);

  useEffect(() => { load(); }, [load]);

  // Realtime sync with admin
  useEffect(() => {
    const ch = supabase
      .channel(`waiter-tables-${tenantId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  async function handleOpen(tableId: string) {
    try {
      await openTbl({ data: { token, tableId } });
      toast.success("Mesa aberta");
      setOpenDlg(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function handleClaim(sessionId: string) {
    try {
      await claim({ data: { token, sessionId } });
      toast.success("Comanda atribuída a você");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">Comandas abertas</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setOpenDlg(true)} disabled={avail.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Abrir Mesa
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Loader text /> :
          rows.length === 0 ? <Empty text="Nenhuma comanda aberta." /> :
          <ul className="divide-y">
            {rows.map((r) => {
              const mine = r.waiter_id === waiterId;
              const other = !!r.waiter_id && !mine;
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <div className="font-semibold">{r.table_name || `Mesa ${r.table_number}`}</div>
                    <div className="text-xs text-muted-foreground">
                      Aberta {new Date(r.opened_at).toLocaleTimeString("pt-BR")}
                      {r.waiter?.full_name && <> · Atendido por <b>{r.waiter.full_name}</b></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{fmtBRL(r.total_amount)}</span>
                    {mine
                      ? <Badge className="bg-primary/15 text-primary">Sua</Badge>
                      : <Button size="sm" variant={other ? "outline" : "default"} onClick={() => handleClaim(r.id)}>
                          <UserCheck className="h-4 w-4 mr-1" /> {other ? "Assumir" : "Reivindicar"}
                        </Button>}
                  </div>
                </li>
              );
            })}
          </ul>}
      </CardContent>

      <Dialog open={openDlg} onOpenChange={setOpenDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir Mesa</DialogTitle></DialogHeader>
          {avail.length === 0
            ? <Empty text="Nenhuma mesa disponível." />
            : <ul className="divide-y max-h-[60vh] overflow-auto">
                {avail.map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between">
                    <span>{t.table_name || `Mesa ${t.table_number}`}</span>
                    <Button size="sm" onClick={() => handleOpen(t.id)}>
                      Abrir <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </li>
                ))}
              </ul>}
          <DialogFooter><Button variant="outline" onClick={() => setOpenDlg(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// ORDERS — show orders for any of my open sessions
// ============================================================
function OrdersTab({ token, waiterId, tenantId }: { token: string; waiterId: string; tenantId: string }) {
  const listSess = useServerFn(listMyTenantSessions);
  const listOrd = useServerFn(listSessionOrders);
  const reqClose = useServerFn(waiterRequestClose);

  const [sessions, setSessions] = useState<SessRow[]>([]);
  const [selected, setSelected] = useState<SessRow | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const mySessions = useMemo(() => sessions.filter((s) => s.waiter_id === waiterId), [sessions, waiterId]);

  const loadSessions = useCallback(async () => {
    try {
      const s = await listSess({ data: { token } });
      setSessions(s as SessRow[]);
    } catch (e: any) { toast.error(e.message); }
  }, [token, listSess]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    const ch = supabase
      .channel(`waiter-orders-${tenantId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "table_sessions", filter: `restaurant_id=eq.${tenantId}` },
        () => { loadSessions(); if (selected) loadOrders(selected); })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "table_session_orders" },
        () => { if (selected) loadOrders(selected); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [tenantId, selected?.id]);

  async function loadOrders(s: SessRow) {
    setSelected(s);
    setLoading(true);
    try {
      const o = await listOrd({ data: { token, sessionId: s.id } });
      setOrders(o as any[]);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleRequestClose(s: SessRow) {
    try {
      const r = await reqClose({ data: { token, sessionId: s.id } });
      toast.success(r.status === "already_pending" ? "Já existe um pedido de fechamento" : "Pedido de fechamento enviado");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Minhas comandas</CardTitle></CardHeader>
        <CardContent>
          {mySessions.length === 0 ? <Empty text="Você não atende nenhuma comanda no momento." />
            : <ul className="divide-y">
                {mySessions.map((s) => (
                  <li key={s.id} className={`py-2 flex items-center justify-between gap-2 cursor-pointer ${selected?.id === s.id ? "bg-muted/50 rounded" : ""}`}
                      onClick={() => loadOrders(s)}>
                    <div>
                      <div className="font-semibold">{s.table_name || `Mesa ${s.table_number}`}</div>
                      <div className="text-xs text-muted-foreground">Total {fmtBRL(s.total_amount)}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {selected ? (selected.table_name || `Mesa ${selected.table_number}`) : "Consumo"}
          </CardTitle>
          {selected && (
            <Button size="sm" variant="default" onClick={() => handleRequestClose(selected)}>
              <BellRing className="h-4 w-4 mr-1" /> Pedir Fechamento
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!selected ? <Empty text="Selecione uma comanda à esquerda." />
            : loading ? <Loader text />
            : orders.length === 0 ? <Empty text="Sem pedidos vinculados ainda." />
            : <ul className="divide-y">
                {orders.map((o) => (
                  <li key={o.id} className="py-2">
                    <div className="flex justify-between items-center">
                      <div className="text-sm">
                        <b>#{o.order_number || o.id.slice(0, 6)}</b>
                        {o.customer_name && <span className="text-muted-foreground"> · {o.customer_name}</span>}
                      </div>
                      <span className="font-mono text-sm">{fmtBRL(o.total)}</span>
                    </div>
                    {Array.isArray(o.items) && o.items.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {o.items.map((it: any, i: number) =>
                          <div key={i}>· {(it.qty ?? it.quantity ?? 1)}× {it.name || it.product_name || "Item"}</div>)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CLOSURES
// ============================================================
function ClosuresTab({ token, tenantId }: { token: string; tenantId: string }) {
  const listReq = useServerFn(listMyCloseRequests);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await listReq({ data: { token } })) as any[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, listReq]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`waiter-closures-${tenantId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "table_close_requests", filter: `restaurant_id=eq.${tenantId}` },
        () => load())
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
        {loading ? <Loader text /> :
          rows.length === 0 ? <Empty text="Nenhum pedido de fechamento pendente." /> :
          <ul className="divide-y">
            {rows.map((r) => (
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
          O fechamento efetivo da mesa é confirmado pelo administrador no painel principal.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// COMMISSIONS — 15% service fee on sessions assigned to this waiter
// ============================================================
function CommissionsTab({ token }: { token: string }) {
  const listCom = useServerFn(listMyCommissions);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"day" | "week" | "month" | "all">("month");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let from: string | undefined;
      if (period === "day") {
        const d = new Date(now); d.setHours(0, 0, 0, 0); from = d.toISOString();
      } else if (period === "week") {
        const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString();
      } else if (period === "month") {
        const d = new Date(now.getFullYear(), now.getMonth(), 1); from = d.toISOString();
      }
      setData(await listCom({ data: { token, fromIso: from } }));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token, period, listCom]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["day", "week", "month", "all"] as const).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
            {p === "day" ? "Hoje" : p === "week" ? "7 dias" : p === "month" ? "Mês" : "Tudo"}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Comandas fechadas" value={s?.closedCount ?? 0} />
        <Stat label="Comandas abertas" value={s?.openCount ?? 0} />
        <Stat label="Subtotal atendido" value={fmtBRL(s?.totalSubtotal ?? 0)} />
        <Stat label="Comissão (15%)" value={fmtBRL(s?.totalCommission ?? 0)} accent />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader text /> :
            !data?.sessions?.length ? <Empty text="Sem comandas no período." /> :
            <ul className="divide-y">
              {data.sessions.map((r: any) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Mesa {r.table_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.opened_at).toLocaleString("pt-BR")}
                      {r.closed_at && <> → {new Date(r.closed_at).toLocaleString("pt-BR")}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtBRL(r.subtotal_amount)}</div>
                    <div className="text-xs text-primary">{fmtBRL(r.service_fee_amount)}</div>
                  </div>
                </li>
              ))}
            </ul>}
          <p className="text-xs text-muted-foreground mt-3">
            A comissão de 15% é calculada com base na taxa de serviço aplicada pela administração ao fechar a mesa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40" : ""}>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}
function Loader({ text }: { text?: boolean }) {
  return (
    <div className="py-8 grid place-items-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {text && <span className="text-xs mt-2">Carregando…</span>}
    </div>
  );
}

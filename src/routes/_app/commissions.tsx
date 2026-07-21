import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Wallet, Percent, RefreshCw, Save, Download } from "lucide-react";
import { toast } from "sonner";
import {
  getCommissionPercent, setCommissionPercent,
  getCommissionReport, listTenantWaiters,
} from "@/lib/commissions.functions";
import { RequireFeature } from "@/components/PremiumFeatureLock";

export const Route = createFileRoute("/_app/commissions")({ component: CommissionsPage });

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Pz = { id: string; name: string };

function CommissionsPage() {
  return (
    <RequireFeature feature="commissions">
      <CommissionsPageInner />
    </RequireFeature>
  );
}

function CommissionsPageInner() {
  const { user, isSuperAdmin } = useAuth();
  const getPct = useServerFn(getCommissionPercent);
  const setPct = useServerFn(setCommissionPercent);
  const getReport = useServerFn(getCommissionReport);
  const listWaiters = useServerFn(listTenantWaiters);

  const [pizzerias, setPizzerias] = useState<Pz[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [pct, setPctState] = useState<number>(10);
  const [savingPct, setSavingPct] = useState(false);

  const [waiters, setWaiters] = useState<{ id: string; full_name: string }[]>([]);
  const [waiterId, setWaiterId] = useState<string>("__all__");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Load stores
  useEffect(() => {
    async function loadStores() {
      if (!user) return;
      let q = supabase.from("pizzerias").select("id, name").order("name");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      const list = (data || []) as Pz[];
      setPizzerias(list);
      if (list.length && !tenantId) setTenantId(list[0].id);
    }
    loadStores();
    // eslint-disable-next-line
  }, [user, isSuperAdmin]);

  // Load pct + waiters for the chosen store
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const [p, w] = await Promise.all([
          getPct({ data: { tenantId } }),
          listWaiters({ data: { tenantId } }),
        ]);
        setPctState(p.percent);
        setWaiters(w as any);
      } catch (e: any) { toast.error(e.message); }
    })();
  }, [tenantId, getPct, listWaiters]);

  const range = useMemo(() => {
    const now = new Date();
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    if (period === "day") from.setHours(0, 0, 0, 0);
    else if (period === "week") { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }
    else { from.setDate(1); from.setHours(0, 0, 0, 0); }
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, [period]);

  const loadReport = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await getReport({
        data: {
          tenantId, fromIso: range.fromIso, toIso: range.toIso,
          waiterId: waiterId === "__all__" ? undefined : waiterId,
        },
      });
      setReport(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [tenantId, range.fromIso, range.toIso, waiterId, getReport]);

  useEffect(() => { loadReport(); }, [loadReport]);

  async function handleSavePct() {
    setSavingPct(true);
    try {
      await setPct({ data: { tenantId, percent: Number(pct) } });
      toast.success("Percentual atualizado");
      loadReport();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPct(false); }
  }

  function exportCsv() {
    if (!report?.sessions?.length) return;
    const header = ["fechamento", "mesa", "garçom", "subtotal", "percentual", "comissão"];
    const lines = report.sessions.map((s: any) => [
      new Date(s.closedAt).toLocaleString("pt-BR"),
      s.tableNumber,
      s.waiterName || "—",
      s.subtotal.toFixed(2),
      s.commissionPercent.toFixed(2),
      s.commissionAmount.toFixed(2),
    ].join(";"));
    const csv = [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `comissoes-${period}.csv`;
    a.click();
  }

  const s = report?.summary;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3">
        <Wallet className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Comissões dos Garçons</h1>
          <p className="text-sm text-muted-foreground">
            Relatórios informativos. Não afetam faturamento, contabilidade ou receita da empresa.
          </p>
        </div>
      </div>

      {pizzerias.length > 1 && (
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <Label className="shrink-0">Loja:</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pizzerias.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="h-4 w-4" /> Percentual de comissão
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label>% sobre o subtotal da mesa</Label>
            <Input
              type="number" min={0} max={100} step={0.5}
              value={pct} onChange={(e) => setPctState(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button onClick={handleSavePct} disabled={savingPct || !tenantId}>
            {savingPct && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
          <p className="text-xs text-muted-foreground basis-full">
            O valor é gravado em cada mesa no momento do fechamento. Mesas já fechadas
            mantêm o percentual vigente na época.
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Período</Label>
            <div className="flex gap-1">
              {(["day", "week", "month"] as const).map((p) => (
                <Button key={p} size="sm" variant={period === p ? "default" : "outline"}
                  onClick={() => setPeriod(p)}>
                  {p === "day" ? "Hoje" : p === "week" ? "7 dias" : "Mês"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Garçom</Label>
            <Select value={waiterId} onValueChange={setWaiterId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {waiters.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report?.sessions?.length}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total de vendas" value={fmtBRL(s?.totalSales ?? 0)} />
        <Stat label="Comissão acumulada" value={fmtBRL(s?.totalCommission ?? 0)} accent />
        <Stat label="Mesas atendidas" value={String(s?.tablesCount ?? 0)} />
        <Stat label="Ticket médio" value={fmtBRL(s?.avgTicket ?? 0)} />
      </div>

      {/* Per-waiter */}
      <Card>
        <CardHeader><CardTitle className="text-base">Por garçom</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Garçom</TableHead>
                <TableHead className="text-right">Mesas</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : !report?.perWaiter?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Sem mesas fechadas no período.
                </TableCell></TableRow>
              ) : report.perWaiter.map((w: any) => (
                <TableRow key={w.waiterId || "none"}>
                  <TableCell className="font-medium">{w.waiterName}</TableCell>
                  <TableCell className="text-right">{w.tables}</TableCell>
                  <TableCell className="text-right">{fmtBRL(w.totalSales)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(w.avgTicket)}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{fmtBRL(w.commission)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sessions detail */}
      <Card>
        <CardHeader><CardTitle className="text-base">Mesas fechadas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fechamento</TableHead>
                <TableHead>Mesa</TableHead>
                <TableHead>Garçom</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!report?.sessions?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">—</TableCell></TableRow>
              ) : report.sessions.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.closedAt).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>Mesa {r.tableNumber}</TableCell>
                  <TableCell>{r.waiterName || "—"}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.subtotal)}</TableCell>
                  <TableCell className="text-right">{r.commissionPercent.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{fmtBRL(r.commissionAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40" : ""}>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

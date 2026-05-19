import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Trophy,
  Calculator,
  Package,
  Filter,
  BarChart3,
  Star,
  Activity,
  ChevronDown,
  Clock,
  Sparkles,
  Pizza,
  CupSoda,
  Wallet,
  Receipt,
  Target,
  Lightbulb,
  Zap,
  RefreshCw,
  ShoppingBag,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/finance")({ component: Finance });

type Period = "today" | "7days" | "30days" | "month";

type Pizzeria = { id: string; name: string; owner_id: string | null; status: string };

type OrderRow = {
  id: string;
  tenant_id: string;
  total: number | string | null;
  status: string;
  created_at: string;
  items: Array<{ name?: string; qty?: number; price?: number; notes?: string }> | null;
};

const periodLabel = (p: Period) =>
  ({ today: "Hoje", "7days": "Últimos 7 dias", "30days": "Últimos 30 dias", month: "Este mês" }[p]);

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function getRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  if (p === "today") return { start: startOfDay(now), end: endOfDay(now) };
  if (p === "7days") return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  if (p === "30days") return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

function classify(name: string): "pizza" | "bebida" | "outro" {
  const n = (name || "").toLowerCase();
  if (n.includes("pizza") || n.includes("calzone") || n.includes("esfiha")) return "pizza";
  if (
    /(refri|coca|guara|guaran|suco|agua|água|cerveja|heineken|skol|brahma|antarctica|fanta|sprite|pepsi|h2o|chá|cha|energético|energetico|red bull|red-bull|monster|gatorade|isot|naturna|kuat|drink|bebida|lata|garrafa|600ml|350ml|2l|1l|2 l|1 l)/i.test(
      n,
    )
  )
    return "bebida";
  return "outro";
}

function Finance() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [pizzerias, setPizzerias] = useState<Pizzeria[]>([]);
  const [selectedPizzeriaId, setSelectedPizzeriaId] = useState<string>("all");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !authLoading && !user) nav({ to: "/login" });
  }, [authLoading, user, nav, mounted]);

  const loadPizzerias = useCallback(async () => {
    const { data, error } = await supabase
      .from("pizzerias")
      .select("id, name, owner_id, status")
      .order("name");
    if (error) {
      toast.error("Erro ao carregar pizzarias");
      return;
    }
    setPizzerias(data || []);
    if (!isSuperAdmin && data && data.length > 0 && selectedPizzeriaId === "all") {
      setSelectedPizzeriaId(data[0].id);
    }
  }, [isSuperAdmin, selectedPizzeriaId]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Pull last 60 days to cover all period filters + comparisons
      const from = startOfDay(subDays(new Date(), 60)).toISOString();
      let q = supabase
        .from("orders")
        .select("id, tenant_id, total, status, created_at, items")
        .gte("created_at", from)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (selectedPizzeriaId !== "all") q = q.eq("tenant_id", selectedPizzeriaId);
      const { data, error } = await q;
      if (error) throw error;
      setOrders((data || []) as OrderRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Finance load error:", e);
      toast.error("Erro ao carregar dados: " + msg);
    } finally {
      setLoading(false);
    }
  }, [user, selectedPizzeriaId]);

  useEffect(() => {
    if (mounted && !authLoading && user) loadPizzerias();
  }, [mounted, authLoading, user, loadPizzerias]);

  useEffect(() => {
    if (mounted && !authLoading && user) loadOrders();
  }, [mounted, authLoading, user, loadOrders]);

  // ============ Derived metrics ============
  const range = useMemo(() => getRange(period), [period]);
  const prevRange = useMemo(() => {
    const span = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime() - span - 1), end: new Date(range.start.getTime() - 1) };
  }, [range]);

  const inRange = (o: OrderRow, r: { start: Date; end: Date }) => {
    const t = new Date(o.created_at).getTime();
    return t >= r.start.getTime() && t <= r.end.getTime();
  };

  const ordersInPeriod = useMemo(() => orders.filter((o) => inRange(o, range)), [orders, range]);
  const ordersPrev = useMemo(() => orders.filter((o) => inRange(o, prevRange)), [orders, prevRange]);

  const sum = (arr: OrderRow[]) => arr.reduce((acc, o) => acc + Number(o.total || 0), 0);

  const now = new Date();
  const revenueToday = sum(orders.filter((o) => inRange(o, { start: startOfDay(now), end: endOfDay(now) })));
  const revenueYesterday = sum(
    orders.filter((o) => inRange(o, { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) })),
  );
  const revenueWeek = sum(orders.filter((o) => inRange(o, { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) })));
  const revenueMonth = sum(orders.filter((o) => inRange(o, { start: startOfMonth(now), end: endOfMonth(now) })));
  const revenueTotal = sum(orders);
  const ordersToday = orders.filter((o) => inRange(o, { start: startOfDay(now), end: endOfDay(now) })).length;
  const ticketToday = ordersToday > 0 ? revenueToday / ordersToday : 0;
  const ticketPeriod = ordersInPeriod.length > 0 ? sum(ordersInPeriod) / ordersInPeriod.length : 0;
  const ticketWeek =
    orders.filter((o) => inRange(o, { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) })).length > 0
      ? revenueWeek /
        orders.filter((o) => inRange(o, { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) })).length
      : 0;
  const ticketMonth =
    orders.filter((o) => inRange(o, { start: startOfMonth(now), end: endOfMonth(now) })).length > 0
      ? revenueMonth /
        orders.filter((o) => inRange(o, { start: startOfMonth(now), end: endOfMonth(now) })).length
      : 0;

  const growth = (current: number, prev: number) => {
    if (prev <= 0) return null;
    return ((current - prev) / prev) * 100;
  };
  const growthToday = growth(revenueToday, revenueYesterday);
  const growthPeriod = growth(sum(ordersInPeriod), sum(ordersPrev));

  // Chart series — group by day across current period
  const chartData = useMemo(() => {
    const days = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    const buckets = new Map<string, { day: string; faturamento: number; pedidos: number; dateObj: Date }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(range.start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = format(d, "yyyy-MM-dd");
      buckets.set(key, { day: format(d, "dd/MM"), faturamento: 0, pedidos: 0, dateObj: d });
    }
    ordersInPeriod.forEach((o) => {
      const key = format(new Date(o.created_at), "yyyy-MM-dd");
      const b = buckets.get(key);
      if (b) {
        b.faturamento += Number(o.total || 0);
        b.pedidos += 1;
      }
    });
    return Array.from(buckets.values());
  }, [ordersInPeriod, range]);

  // Rankings
  const rankings = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; type: "pizza" | "bebida" | "outro" }>();
    ordersInPeriod.forEach((o) => {
      (o.items || []).forEach((it) => {
        const name = (it.name || "").trim();
        if (!name) return;
        const qty = Number(it.qty || 1);
        const price = Number(it.price || 0);
        const k = name;
        const prev = map.get(k) || { name, qty: 0, revenue: 0, type: classify(name) };
        prev.qty += qty;
        prev.revenue += price * qty;
        map.set(k, prev);
      });
    });
    const all = Array.from(map.values());
    const totalRevAll = all.reduce((a, b) => a + b.revenue, 0) || 1;
    const decorate = (arr: typeof all) =>
      arr.map((x) => ({ ...x, share: (x.revenue / totalRevAll) * 100 })).sort((a, b) => b.qty - a.qty);
    return {
      pizzas: decorate(all.filter((x) => x.type === "pizza")).slice(0, 5),
      bebidas: decorate(all.filter((x) => x.type === "bebida")).slice(0, 5),
      top: decorate(all).slice(0, 5),
    };
  }, [ordersInPeriod]);

  // Best hour
  const peakHour = useMemo(() => {
    const h = new Array(24).fill(0);
    ordersInPeriod.forEach((o) => {
      h[new Date(o.created_at).getHours()] += 1;
    });
    const max = Math.max(...h);
    if (max === 0) return null;
    return { hour: h.indexOf(max), count: max };
  }, [ordersInPeriod]);

  const lastOrder = orders[0];
  const healthStatus: "Saudável" | "Atenção" | "Baixo movimento" =
    revenueMonth > 1000 ? "Saudável" : revenueMonth > 200 ? "Atenção" : "Baixo movimento";

  const selectedPizzeria = pizzerias.find((p) => p.id === selectedPizzeriaId);

  if (!mounted || authLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!user) {
    return <div className="p-8 text-center text-muted-foreground">Sessão expirada. Faça login novamente.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* ========== HEADER ========== */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl opacity-50" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Gestão Financeira</h1>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Controle seu faturamento, acompanhe vendas e descubra quais produtos mais movimentam sua pizzaria.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground">Dados em tempo real</span>
              {selectedPizzeria && (
                <Badge variant="outline" className="ml-2 border-primary/30">
                  {selectedPizzeria.name}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Activity className="h-4 w-4" />
                    {selectedPizzeriaId === "all" ? "Todas as Pizzarias" : selectedPizzeria?.name || "Selecionar"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-auto">
                  <DropdownMenuItem onClick={() => setSelectedPizzeriaId("all")}>Todas as Pizzarias</DropdownMenuItem>
                  {pizzerias.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setSelectedPizzeriaId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {periodLabel(period)}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("7days")}>Últimos 7 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("30days")}>Últimos 30 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("month")}>Este mês</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-2 shadow-lg shadow-primary/20" onClick={loadOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* ========== EMPTY STATE ========== */}
      {!loading && orders.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ========== KPI CARDS ========== */}
          <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <KpiBig
              title="Faturamento Hoje"
              value={fmtBRL(revenueToday)}
              subtitle={
                growthToday === null
                  ? "Sem comparação suficiente ainda"
                  : `${growthToday >= 0 ? "+" : ""}${growthToday.toFixed(1)}% em relação a ontem`
              }
              icon={Flame}
              trend={growthToday}
              highlight
            />
            <KpiBig
              title="Faturamento da Semana"
              value={fmtBRL(revenueWeek)}
              subtitle="Acumulado da semana atual"
              icon={Calendar}
            />
            <KpiBig
              title="Faturamento do Mês"
              value={fmtBRL(revenueMonth)}
              subtitle="Acumulado do mês atual"
              icon={TrendingUp}
              highlight
            />
            <KpiSmall title="Faturamento Total" value={fmtBRL(revenueTotal)} subtitle="Últimos 60 dias" icon={DollarSign} />
            <KpiSmall
              title="Pedidos Hoje"
              value={String(ordersToday)}
              subtitle="Volume de vendas de hoje"
              icon={ShoppingBag}
            />
            <KpiSmall
              title="Ticket Médio"
              value={fmtBRL(ticketToday)}
              subtitle="Média por pedido hoje"
              icon={Receipt}
            />
          </section>

          {/* ========== CHART + TICKET ANALYSIS ========== */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-5 w-5 text-primary" /> Evolução do Faturamento
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Faturamento e pedidos por dia — {periodLabel(period).toLowerCase()}
                  </p>
                </div>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {ordersInPeriod.length} pedidos
                </Badge>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(val: number, name) => [name === "faturamento" ? fmtBRL(val) : val, name === "faturamento" ? "Faturamento" : "Pedidos"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="faturamento"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        fill="url(#grad1)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-24 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [`${v} pedidos`, "Pedidos"]}
                      />
                      <Bar dataKey="pedidos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm bg-gradient-to-br from-orange-500/5 via-transparent to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-5 w-5 text-primary" /> Ticket Médio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <TicketRow label="Hoje" value={ticketToday} />
                <TicketRow label="Semana" value={ticketWeek} />
                <TicketRow label="Mês" value={ticketMonth} />
                <div className="pt-3 border-t border-dashed border-border">
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {ticketMonth < 50
                        ? "Sugestão: crie combos com bebida ou borda recheada para aumentar o valor por pedido."
                        : "Ótimo desempenho! Seus pedidos estão mantendo bom valor médio."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ========== RANKINGS ========== */}
          <section className="grid gap-6 lg:grid-cols-2">
            <RankingCard
              title="Pizzas mais vendidas"
              icon={Pizza}
              accent="from-orange-500/10"
              items={rankings.pizzas}
              emptyText="Nenhuma pizza vendida no período."
            />
            <RankingCard
              title="Bebidas mais vendidas"
              icon={CupSoda}
              accent="from-sky-500/10"
              items={rankings.bebidas}
              emptyText="Nenhuma bebida vendida no período. Adicione bebidas ao cardápio para aumentar o ticket médio."
            />
          </section>

          {/* ========== OPERATIONAL SUMMARY + INSIGHTS ========== */}
          <section className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3 border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-5 w-5 text-primary" /> Resumo da operação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border/60">
                  <SummaryRow label="Total de pedidos no período" value={String(ordersInPeriod.length)} icon={Package} />
                  <SummaryRow label="Faturamento bruto" value={fmtBRL(sum(ordersInPeriod))} icon={DollarSign} />
                  <SummaryRow
                    label="Produto campeão"
                    value={rankings.top[0]?.name || "—"}
                    icon={Trophy}
                  />
                  <SummaryRow
                    label="Bebida campeã"
                    value={rankings.bebidas[0]?.name || "Nenhuma"}
                    icon={CupSoda}
                  />
                  <SummaryRow
                    label="Último pedido recebido"
                    value={lastOrder ? format(new Date(lastOrder.created_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : "—"}
                    icon={Clock}
                  />
                  <SummaryRow
                    label="Horário de maior movimento"
                    value={peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00h (${peakHour.count} pedidos)` : "Sem dados ainda"}
                    icon={Activity}
                  />
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Star className="h-4 w-4" /> Status financeiro
                    </div>
                    <Badge
                      className={
                        healthStatus === "Saudável"
                          ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                          : healthStatus === "Atenção"
                          ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                          : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                      }
                    >
                      {healthStatus}
                    </Badge>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-primary" /> Insights inteligentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InsightCard
                  icon={Flame}
                  text={
                    rankings.top[0]
                      ? `Seu produto mais vendido foi ${rankings.top[0].name} (${rankings.top[0].qty} vendas).`
                      : "Ainda não há produtos vendidos no período."
                  }
                />
                <InsightCard icon={Receipt} text={`Seu ticket médio está em ${fmtBRL(ticketPeriod)}.`} />
                {rankings.bebidas.length === 0 && (
                  <InsightCard icon={CupSoda} text="As bebidas representam uma oportunidade de venda adicional." />
                )}
                {ticketMonth < 60 && (
                  <InsightCard icon={Zap} text="Adicionar combos pode aumentar o faturamento por pedido." />
                )}
                {peakHour && (
                  <InsightCard
                    icon={Clock}
                    text={`Seu horário de pico é ${String(peakHour.hour).padStart(2, "0")}h — divulgue promoções fora desse horário para suavizar o movimento.`}
                  />
                )}
                {growthPeriod !== null && growthPeriod > 0 && (
                  <InsightCard
                    icon={TrendingUp}
                    text={`Crescimento de ${growthPeriod.toFixed(1)}% comparado ao período anterior. Excelente!`}
                  />
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

// ============ Sub-components ============

function KpiBig({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  highlight,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number | null;
  highlight?: boolean;
}) {
  const TrendIcon = trend == null ? null : trend >= 0 ? TrendingUp : TrendingDown;
  return (
    <Card
      className={`relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 ${
        highlight ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent" : "border-border/60"
      }`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-2.5 rounded-xl ${
              highlight ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-muted text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          {TrendIcon && trend != null && (
            <div
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                trend >= 0 ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
            >
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground">{title}</div>
        <div className="text-3xl font-black tracking-tight mt-1">{value}</div>
        <div className="text-xs text-muted-foreground mt-2">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function KpiSmall({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/60 hover:border-primary/30 transition-all hover:shadow-md">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground truncate">{title}</div>
          <div className="text-xl font-black tracking-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-black">{fmtBRL(value)}</span>
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  accent,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  items: Array<{ name: string; qty: number; revenue: number; share: number }>;
  emptyText: string;
}) {
  return (
    <Card className={`border-border/60 shadow-sm overflow-hidden bg-gradient-to-br ${accent} to-transparent`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">{emptyText}</div>
        ) : (
          <ul className="space-y-4">
            {items.map((it, i) => (
              <li key={it.name} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Medal pos={i + 1} />
                    <span className="font-semibold truncate">{it.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black">{it.qty} vendas</div>
                    <div className="text-[11px] text-muted-foreground">{fmtBRL(it.revenue)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all"
                      style={{ width: `${Math.min(it.share, 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-muted-foreground w-12 text-right">
                    {it.share.toFixed(0)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Medal({ pos }: { pos: number }) {
  const styles =
    pos === 1
      ? "bg-yellow-400 text-yellow-950 shadow-md shadow-yellow-400/30"
      : pos === 2
      ? "bg-slate-300 text-slate-800"
      : pos === 3
      ? "bg-amber-700 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shrink-0 ${styles}`}>
      {pos}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <span className="text-sm font-bold truncate text-right">{value}</span>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors border border-border/40">
      <div className="p-1.5 rounded-lg bg-primary/15 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent text-center space-y-5">
      <div className="p-5 rounded-2xl bg-primary/10">
        <Calculator className="h-12 w-12 text-primary" />
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-xl font-black">Seu painel financeiro está pronto para decolar</h3>
        <p className="text-sm text-muted-foreground">
          Assim que os pedidos começarem a chegar, seus indicadores financeiros aparecerão aqui — faturamento, ticket
          médio, ranking de produtos e insights automáticos.
        </p>
      </div>
    </div>
  );
}

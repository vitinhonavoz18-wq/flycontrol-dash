import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Package,
  Filter,
  BarChart3,
  Activity,
  ChevronDown,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Building2,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Download,
  Store,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, eachDayOfInterval, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/admin/finance")({ component: AdminFinance });

type Period = "today" | "yesterday" | "7days" | "30days" | "month" | "last_month";

type Pizzeria = { 
  id: string; 
  name: string; 
  slug: string; 
  status: string; 
  is_active: boolean | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  tenant_id: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
};

const periodLabel = (p: Period) =>
  ({
    today: "Hoje",
    yesterday: "Ontem",
    "7days": "Últimos 7 dias",
    "30days": "Últimos 30 dias",
    month: "Este mês",
    last_month: "Mês passado",
  }[p]);

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function getRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  if (p === "today") return { start: startOfDay(now), end: endOfDay(now) };
  if (p === "yesterday") return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
  if (p === "7days") return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  if (p === "30days") return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
  if (p === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
}

function normalizePaymentMethod(method: string | null): string {
  if (!method) return "Outros";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "PIX";
  if (m.includes("cartão") || m.includes("cartao") || m.includes("crédito") || m.includes("débito")) return "Cartão";
  if (m.includes("dinheiro")) return "Dinheiro";
  return "Outros";
}

function AdminFinance() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [pizzerias, setPizzerias] = useState<Pizzeria[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  useEffect(() => setMounted(true), []);

  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const hasAccess = isSuperAdmin || isHardcodedAdmin;

  useEffect(() => {
    if (mounted && !authLoading && !hasAccess) nav({ to: "/dashboard" });
  }, [authLoading, hasAccess, nav, mounted]);

  const loadData = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const [pzRes, ordersRes] = await Promise.all([
        supabase.from("pizzerias").select("id, name, slug, status, is_active, created_at").order("name"),
        supabase.from("orders").select("id, tenant_id, total, subtotal, delivery_fee, discount, status, payment_method, created_at").neq("status", "deleted")
      ]);

      if (pzRes.error) throw pzRes.error;
      if (ordersRes.error) throw ordersRes.error;

      setPizzerias(pzRes.data || []);
      setOrders((ordersRes.data || []).map(o => ({
        ...o,
        total: Number(o.total || 0),
        subtotal: Number(o.subtotal || 0),
        delivery_fee: Number(o.delivery_fee || 0),
        discount: Number(o.discount || 0)
      })) as OrderRow[]);
    } catch (e: any) {
      console.error("Admin Finance load error:", e);
      toast.error("Erro ao carregar dados administrativos");
    } finally {
      setLoading(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    if (mounted && !authLoading && hasAccess) loadData();
  }, [mounted, authLoading, hasAccess, loadData]);

  // Filters & Metrics
  const range = useMemo(() => getRange(period), [period]);
  const prevRange = useMemo(() => {
    const span = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime() - span - 1), end: new Date(range.start.getTime() - 1) };
  }, [range]);

  const inRange = (o: OrderRow, r: { start: Date; end: Date }) => {
    const t = new Date(o.created_at).getTime();
    return t >= r.start.getTime() && t <= r.end.getTime();
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const isInDate = inRange(o, range);
      const matchesPayment = paymentFilter === "all" || normalizePaymentMethod(o.payment_method) === paymentFilter;
      const matchesOrderStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
      return isInDate && matchesPayment && matchesOrderStatus;
    });
  }, [orders, range, paymentFilter, orderStatusFilter]);

  const prevOrders = useMemo(() => {
    return orders.filter(o => inRange(o, prevRange));
  }, [orders, prevRange]);

  const calculateMetrics = (arr: OrderRow[]) => {
    const revenue = arr.reduce((acc, o) => acc + o.total, 0);
    const count = arr.length;
    const ticket = count > 0 ? revenue / count : 0;
    const deliveryFees = arr.reduce((acc, o) => acc + o.delivery_fee, 0);
    return { revenue, count, ticket, deliveryFees };
  };

  const metrics = useMemo(() => calculateMetrics(filteredOrders), [filteredOrders]);
  const prevMetrics = useMemo(() => calculateMetrics(prevOrders), [prevOrders]);

  const growth = (curr: number, prev: number) => {
    if (prev <= 0) return null;
    return ((curr - prev) / prev) * 100;
  };

  const revenueGrowth = growth(metrics.revenue, prevMetrics.revenue);
  const countGrowth = growth(metrics.count, prevMetrics.count);

  // Ranking by Restaurant
  const restaurantRanking = useMemo(() => {
    const stats = new Map<string, { 
      revenue: number; 
      count: number; 
      lastOrder: string | null; 
      paymentMethod: string;
      payments: Record<string, number>;
    }>();

    filteredOrders.forEach(o => {
      const s = stats.get(o.tenant_id) || { revenue: 0, count: 0, lastOrder: null, paymentMethod: "", payments: {} };
      s.revenue += o.total;
      s.count += 1;
      if (!s.lastOrder || new Date(o.created_at) > new Date(s.lastOrder)) {
        s.lastOrder = o.created_at;
      }
      const method = normalizePaymentMethod(o.payment_method);
      s.payments[method] = (s.payments[method] || 0) + 1;
      stats.set(o.tenant_id, s);
    });

    return pizzerias.map(p => {
      const s = stats.get(p.id) || { revenue: 0, count: 0, lastOrder: null, paymentMethod: "N/A", payments: {} };
      
      // Determine predominant payment method
      let max = 0;
      let predominant = "N/A";
      Object.entries(s.payments).forEach(([m, v]) => {
        if (v > max) {
          max = v;
          predominant = m;
        }
      });

      return {
        ...p,
        revenue: s.revenue,
        count: s.count,
        ticket: s.count > 0 ? s.revenue / s.count : 0,
        lastOrder: s.lastOrder,
        predominantPayment: predominant
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [pizzerias, filteredOrders]);

  const searchedRanking = useMemo(() => {
    return restaurantRanking.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.slug.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? p.is_active : !p.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [restaurantRanking, searchTerm, statusFilter]);

  // Chart data
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    const buckets = new Map<string, { day: string; revenue: number; orders: number }>();
    
    days.forEach(d => {
      const key = format(d, "yyyy-MM-dd");
      buckets.set(key, { 
        day: format(d, days.length > 31 ? "MM/yy" : "dd/MM"), 
        revenue: 0, 
        orders: 0 
      });
    });

    filteredOrders.forEach((o) => {
      const key = format(new Date(o.created_at), "yyyy-MM-dd");
      const b = buckets.get(key);
      if (b) {
        b.revenue += o.total;
        b.orders += 1;
      }
    });
    return Array.from(buckets.values());
  }, [filteredOrders, range]);

  const top10Restaurants = useMemo(() => {
    return restaurantRanking.slice(0, 10).map(p => ({
      name: p.name,
      revenue: p.revenue
    }));
  }, [restaurantRanking]);

  const paymentChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
      const m = normalizePaymentMethod(o.payment_method);
      map.set(m, (map.get(m) || 0) + 1);
    });
    const colors: any = { PIX: "#10b981", Cartão: "#3b82f6", Dinheiro: "#f59e0b", Outros: "#94a3b8" };
    return Array.from(map.entries()).map(([name, value]) => ({
      name, value, color: colors[name] || colors.Outros
    })).sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const activePizzerias = pizzerias.filter(p => p.is_active).length;
  const inactivePizzerias = pizzerias.length - activePizzerias;

  const exportCSV = () => {
    const headers = ["Restaurante", "Slug", "Status", "Pedidos", "Faturamento", "Ticket Médio", "Último Pedido"];
    const rows = searchedRanking.map(p => [
      p.name,
      p.slug,
      p.is_active ? "Ativo" : "Inativo",
      p.count,
      p.revenue.toFixed(2),
      p.ticket.toFixed(2),
      p.lastOrder ? format(new Date(p.lastOrder), "dd/MM/yyyy HH:mm") : "N/A"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `financeiro_global_${period}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!mounted || authLoading) {
    return (
      <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Financeiro Global</h1>
              <p className="text-sm text-muted-foreground">Visão consolidada de toda a plataforma</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                {periodLabel(period)}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(["today", "yesterday", "7days", "30days", "month", "last_month"] as Period[]).map((p) => (
                <DropdownMenuItem key={p} onClick={() => setPeriod(p)}>
                  {periodLabel(p)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Faturamento Total" 
          value={fmtBRL(metrics.revenue)} 
          sub={periodLabel(period)} 
          icon={DollarSign}
          growth={revenueGrowth}
          color="primary"
        />
        <MetricCard 
          title="Total de Pedidos" 
          value={metrics.count} 
          sub="No período" 
          icon={ShoppingBag}
          growth={countGrowth}
          color="blue"
        />
        <MetricCard 
          title="Ticket Médio" 
          value={fmtBRL(metrics.ticket)} 
          sub="Geral" 
          icon={TrendingUp}
          color="green"
        />
        <MetricCard 
          title="Restaurantes" 
          value={pizzerias.length} 
          sub={`${activePizzerias} ativos / ${inactivePizzerias} inativos`} 
          icon={Store}
          color="orange"
        />
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
            <div>
              <CardTitle className="text-lg font-bold">Desempenho Diário</CardTitle>
              <CardDescription>Faturamento e pedidos por dia no período</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 12}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 12}}
                    tickFormatter={(v) => `R$ ${v}`}
                  />
                  <RTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    formatter={(v: any, name: string) => [name === 'revenue' ? fmtBRL(v) : v, name === 'revenue' ? 'Faturamento' : 'Pedidos']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    name="revenue"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Top 10 Restaurantes</CardTitle>
            <CardDescription>Por faturamento no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10Restaurants} layout="vertical" margin={{ left: 30, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{fill: '#64748b', fontSize: 10}}
                    width={100}
                  />
                  <RTooltip 
                    formatter={(v: any) => fmtBRL(v)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                    {top10Restaurants.map((entry, index) => (
                      <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.05)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Pagamentos</CardTitle>
            <CardDescription>Volume de pedidos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {paymentChartData.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-muted-foreground">{p.name}</span>
                  </div>
                  <span className="font-bold">{p.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* You could add another small insight card here if needed */}
      </div>

      {/* RANKING TABLE */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold">Ranking de Restaurantes</CardTitle>
            <CardDescription>Desempenho detalhado de cada delivery no período</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar restaurante..." 
                className="pl-9 h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <Filter className="h-4 w-4" />
                  Status: {statusFilter === "all" ? "Todos" : statusFilter === "active" ? "Ativos" : "Inativos"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setStatusFilter("all")}>Todos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("active")}>Ativos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("inactive")}>Inativos</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[250px] font-bold">Restaurante</TableHead>
                  <TableHead className="font-bold">Conta</TableHead>
                  <TableHead className="font-bold">Operacional</TableHead>
                  <TableHead className="text-right font-bold">Pedidos</TableHead>
                  <TableHead className="text-right font-bold">Faturamento</TableHead>
                  <TableHead className="text-right font-bold">Ticket Médio</TableHead>
                  <TableHead className="font-bold">Pagamento</TableHead>
                  <TableHead className="text-right font-bold">Último Pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : searchedRanking.length > 0 ? (
                  searchedRanking.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{p.name}</span>
                          <span className="text-xs text-muted-foreground">/{p.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "destructive"} className={p.is_active ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20" : "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20"}>
                          {p.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.status === 'active' ? 'border-primary/30 text-primary' : 'border-muted-foreground/30 text-muted-foreground'}>
                          {p.status === 'active' ? 'Online' : 'Pausado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{p.count}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{fmtBRL(p.revenue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtBRL(p.ticket)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {p.predominantPayment}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {p.lastOrder ? (
                          <div className="flex flex-col">
                            <span>{format(new Date(p.lastOrder), "dd/MM HH:mm")}</span>
                            <span className="text-[10px]">{format(new Date(p.lastOrder), "yyyy")}</span>
                          </div>
                        ) : "Nenhum"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                      Nenhum dado encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, growth, color = "primary" }: any) {
  const colorMap: any = {
    primary: "bg-primary text-primary-foreground",
    blue: "bg-blue-500 text-white",
    green: "bg-green-500 text-white",
    orange: "bg-orange-500 text-white",
  };

  return (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2 rounded-lg ${colorMap[color]} shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
          {growth !== undefined && growth !== null && (
            <div className={`flex items-center gap-0.5 text-xs font-bold ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {growth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(growth).toFixed(1)}%
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <h3 className="text-2xl font-black mt-1">{value}</h3>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
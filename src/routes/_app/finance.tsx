import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { normalizeOrderType } from "./dashboard";
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
  CreditCard,
  Banknote,
  Smartphone,
  Info,
  Truck,
  History,
  ArrowUpRight,
  ArrowDownRight,
  LayoutGrid
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, subMonths, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/finance")({ component: Finance });

type Period = "today" | "yesterday" | "7days" | "30days" | "month" | "last_month";

type Pizzeria = { id: string; name: string; owner_id: string | null; status: string };

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
  items: Array<{ name?: string; qty?: number; price?: number; notes?: string }> | null;
  order_number: number;
  customer_name: string | null;
  order_type?: string | null;
  service_mode?: string | null;
  table_number?: string | null;
  tableNumber?: string | null;
  mesa?: string | null;
  fulfillment_type?: string | null;
  delivery_type?: string | null;
  customer_address?: string | null;
  address?: string | null;
  delivery_address?: string | null;
  location?: string | null;
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

function normalizePaymentMethod(method: string | null): string {
  if (!method) return "Outros";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "PIX";
  if (m.includes("cartão") || m.includes("cartao") || m.includes("crédito") || m.includes("débito")) return "Cartão";
  if (m.includes("dinheiro")) return "Dinheiro";
  return "Outros";
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
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !authLoading && !user) nav({ to: "/login" });
  }, [authLoading, user, nav, mounted]);

  const loadPizzerias = useCallback(async () => {
    if (!user) return;
    let query = supabase.from("pizzerias").select("id, name, owner_id, status");
    
    // Only filter by owner_id if NOT a super admin
    if (!isSuperAdmin) {
      query = query.eq("owner_id", user.id);
    }
    
    const { data, error } = await query.order("name");
    
    if (error) {
      toast.error("Erro ao carregar pizzarias");
      return;
    }
    
    setPizzerias(data || []);
    
    if (data && data.length > 0) {
      // If the currently selected ID is "all" but the user is not a super admin, select the first one
      if (!isSuperAdmin && (selectedPizzeriaId === "all" || !data.find(p => p.id === selectedPizzeriaId))) {
        setSelectedPizzeriaId(data[0].id);
      }
    }
  }, [isSuperAdmin, selectedPizzeriaId, user]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Pull last 90 days to cover comparison with "Mês passado"
      const from = startOfDay(subDays(new Date(), 90)).toISOString();
      let q = supabase
        .from("orders")
        .select("id, tenant_id, total, subtotal, delivery_fee, discount, status, payment_method, created_at, items, order_number, customer_name, order_type, service_mode, table_number, customer_address")
        .gte("created_at", from)
        .neq("status", "deleted") // Deleted is treated as cancelled
        .order("created_at", { ascending: false })
        .limit(10000);

      // If a pizzeria is selected, filter by it
      if (selectedPizzeriaId !== "all") {
        q = q.eq("tenant_id", selectedPizzeriaId);
      } else if (!isSuperAdmin) {
        // If "all" is selected but user is NOT super admin, we need to limit to their pizzerias
        const myPizzeriaIds = pizzerias.map(p => p.id);
        if (myPizzeriaIds.length > 0) {
          q = q.in("tenant_id", myPizzeriaIds);
        } else {
          // No pizzerias owned
          setOrders([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      setOrders((data || []).map(o => ({
        ...o,
        total: Number(o.total || 0),
        subtotal: Number(o.subtotal || 0),
        delivery_fee: Number(o.delivery_fee || 0),
        discount: Number(o.discount || 0)
      })) as OrderRow[]);
    } catch (e: unknown) {
      console.error("Finance load error:", e);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  }, [user, selectedPizzeriaId, isSuperAdmin, pizzerias]);

  useEffect(() => {
    if (mounted && !authLoading && user) loadPizzerias();
  }, [mounted, authLoading, user, loadPizzerias]);

  useEffect(() => {
    if (mounted && !authLoading && user && (isSuperAdmin || pizzerias.length > 0)) loadOrders();
  }, [mounted, authLoading, user, loadOrders, isSuperAdmin, pizzerias.length]);

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

  // Applied filters on top of the date range
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesPayment = paymentFilter === "all" || normalizePaymentMethod(o.payment_method) === paymentFilter;
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesType = typeFilter === "all" || normalizeOrderType(o) === typeFilter;
      return matchesPayment && matchesStatus && matchesType;
    });
  }, [orders, paymentFilter, statusFilter, typeFilter]);


  const ordersInPeriod = useMemo(() => filteredOrders.filter((o) => inRange(o, range)), [filteredOrders, range]);
  const ordersPrev = useMemo(() => filteredOrders.filter((o) => inRange(o, prevRange)), [filteredOrders, prevRange]);

  const calculateMetrics = (arr: OrderRow[]) => {
    const revenue = arr.reduce((acc, o) => acc + o.total, 0);
    const deliveryFees = arr.reduce((acc, o) => acc + o.delivery_fee, 0);
    const subtotal = arr.reduce((acc, o) => acc + o.subtotal, 0);
    const count = arr.length;
    const ticket = count > 0 ? revenue / count : 0;
    
    // Payment method breakdown
    const payments = new Map<string, number>();
    arr.forEach(o => {
      const method = normalizePaymentMethod(o.payment_method);
      payments.set(method, (payments.get(method) || 0) + 1);
    });

    return { revenue, deliveryFees, subtotal, count, ticket, payments };
  };

  const currentMetrics = useMemo(() => calculateMetrics(ordersInPeriod), [ordersInPeriod]);
  const prevMetrics = useMemo(() => calculateMetrics(ordersPrev), [ordersPrev]);

  const growth = (current: number, prev: number) => {
    if (prev <= 0) return null;
    return ((current - prev) / prev) * 100;
  };

  const revenueGrowth = growth(currentMetrics.revenue, prevMetrics.revenue);
  const ordersGrowth = growth(currentMetrics.count, prevMetrics.count);

  // Chart series — group by day across current period
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    const buckets = new Map<string, { day: string; faturamento: number; pedidos: number; dateObj: Date }>();
    
    days.forEach(d => {
      const key = format(d, "yyyy-MM-dd");
      buckets.set(key, { 
        day: format(d, days.length > 31 ? "MM/yy" : "dd/MM"), 
        faturamento: 0, 
        pedidos: 0, 
        dateObj: d 
      });
    });

    ordersInPeriod.forEach((o) => {
      const key = format(new Date(o.created_at), "yyyy-MM-dd");
      const b = buckets.get(key);
      if (b) {
        b.faturamento += o.total;
        b.pedidos += 1;
      }
    });
    return Array.from(buckets.values());
  }, [ordersInPeriod, range]);

  // Payment method chart data
  const paymentChartData = useMemo(() => {
    const data: { name: string; value: number; color: string }[] = [];
    const colors = {
      PIX: "#10b981",
      Cartão: "#3b82f6",
      Dinheiro: "#f59e0b",
      Outros: "#94a3b8"
    };
    
    currentMetrics.payments.forEach((count, method) => {
      data.push({ 
        name: method, 
        value: count, 
        color: colors[method as keyof typeof colors] || colors.Outros 
      });
    });
    
    return data.sort((a, b) => b.value - a.value);
  }, [currentMetrics.payments]);

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
      top: decorate(all).slice(0, 10),
    };
  }, [ordersInPeriod]);

  // Best hour
  const hourlyData = useMemo(() => {
    const h = new Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));
    ordersInPeriod.forEach((o) => {
      const hour = new Date(o.created_at).getHours();
      h[hour].count += 1;
    });
    return h;
  }, [ordersInPeriod]);

  const peakHour = useMemo(() => {
    const max = Math.max(...hourlyData.map(d => d.count));
    if (max === 0) return null;
    const item = hourlyData.find(d => d.count === max);
    return item ? { hour: item.hour, count: max } : null;
  }, [hourlyData]);

  const selectedPizzeria = pizzerias.find((p) => p.id === selectedPizzeriaId);

  if (!mounted || authLoading) {
    return (
      <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-[400px] md:col-span-2 rounded-2xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    );
  }

  const lastOrder = orders[0];
  const healthStatus: "Saudável" | "Atenção" | "Baixo movimento" =
    currentMetrics.revenue > 1000 ? "Saudável" : currentMetrics.revenue > 200 ? "Atenção" : "Baixo movimento";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* ========== HEADER ========== */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8 shadow-sm">
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
                  Controle total do seu delivery. Acompanhe faturamento, ticket médio e desempenho de produtos em tempo real.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-semibold text-muted-foreground">Atualizado agora</span>
              </div>
              {selectedPizzeria && selectedPizzeriaId !== "all" && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Pizza className="h-3 w-3 mr-1.5" />
                  {selectedPizzeria.name}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm border-border/60">
                    <Activity className="h-4 w-4" />
                    {selectedPizzeriaId === "all" ? "Todas as Pizzarias" : selectedPizzeria?.name || "Selecionar"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-auto">
                  <DropdownMenuLabel>Filtrar por Restaurante</DropdownMenuLabel>
                  <DropdownMenuSeparator />
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
                <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm border-border/60">
                  <Activity className="h-4 w-4" />
                  Status: {statusFilter === "all" ? "Todos" : statusFilter}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setStatusFilter("all")}>Todos os Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("novo")}>Novo</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter("entregue")}>Entregue</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm border-border/60">
                  <Filter className="h-4 w-4" />
                  Pagamento: {paymentFilter === "all" ? "Todos" : paymentFilter}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPaymentFilter("all")}>Todos os Métodos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPaymentFilter("PIX")}>PIX</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPaymentFilter("Cartão")}>Cartão</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPaymentFilter("Dinheiro")}>Dinheiro</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm border-border/60">
                  <LayoutGrid className="h-4 w-4" />
                  Tipo: {typeFilter === "all" ? "Todos" : (typeFilter === "delivery" ? "Delivery" : typeFilter === "pickup" ? "Retirada" : "Mesa")}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTypeFilter("all")}>Todos os Tipos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter("delivery")}>Delivery</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter("pickup")}>Retirada</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter("table")}>Mesa</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm border-border/60">
                  <History className="h-4 w-4" />
                  {periodLabel(period)}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("yesterday")}>Ontem</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("7days")}>Últimos 7 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("30days")}>Últimos 30 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("month")}>Este mês</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("last_month")}>Mês passado</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" className="gap-2 shadow-lg shadow-primary/20" onClick={loadOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ========== EMPTY STATE ========== */}
      {!loading && orders.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ========== MAIN KPIs ========== */}
          <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Faturamento Bruto"
              value={fmtBRL(currentMetrics.revenue)}
              trend={revenueGrowth}
              icon={TrendingUp}
              description={`Comparado a: ${periodLabel(period === 'month' ? 'last_month' : period)}`}
              highlight
            />
            <KpiCard
              title="Total de Pedidos"
              value={String(currentMetrics.count)}
              trend={ordersGrowth}
              icon={Package}
              description="Volume total no período"
            />
            <KpiCard
              title="Ticket Médio"
              value={fmtBRL(currentMetrics.ticket)}
              trend={growth(currentMetrics.ticket, prevMetrics.ticket)}
              icon={Receipt}
              description="Valor médio por pedido"
            />
            <KpiCard
              title="Taxas de Entrega"
              value={fmtBRL(currentMetrics.deliveryFees)}
              icon={Truck}
              description="Total arrecadado em fretes"
            />
          </section>

          {/* ========== TABLE KPI ========== */}
          <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
             <Card className="border-border/60 shadow-sm bg-purple-500/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-purple-500 text-white shadow-lg shadow-purple-500/20">
                      <LayoutGrid className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Vendas em Mesas</p>
                      <h3 className="text-2xl font-black">{fmtBRL(ordersInPeriod.filter(o => normalizeOrderType(o) === 'table').reduce((acc, o) => acc + o.total, 0))}</h3>
                      <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-0.5">
                        {ordersInPeriod.filter(o => normalizeOrderType(o) === 'table').length} pedidos
                      </p>
                    </div>
                  </div>
                </CardContent>
             </Card>
             <Card className="border-border/60 shadow-sm bg-blue-500/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/20">
                      <ShoppingBag className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Vendas Retirada</p>
                      <h3 className="text-2xl font-black">{fmtBRL(ordersInPeriod.filter(o => normalizeOrderType(o) === 'pickup').reduce((acc, o) => acc + o.total, 0))}</h3>
                      <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mt-0.5">
                        {ordersInPeriod.filter(o => normalizeOrderType(o) === 'pickup').length} pedidos
                      </p>
                    </div>
                  </div>
                </CardContent>
             </Card>
             <Card className="border-border/60 shadow-sm bg-orange-500/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                      <Truck className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Vendas Delivery</p>
                      <h3 className="text-2xl font-black">{fmtBRL(ordersInPeriod.filter(o => normalizeOrderType(o) === 'delivery').reduce((acc, o) => acc + o.total, 0))}</h3>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-wider mt-0.5">
                        {ordersInPeriod.filter(o => normalizeOrderType(o) === 'delivery').length} pedidos
                      </p>
                    </div>
                  </div>
                </CardContent>
             </Card>
          </section>

          {/* ========== CHARTS SECTION ========== */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <BarChart3 className="h-5 w-5 text-primary" /> Desempenho Diário
                  </CardTitle>
                  <CardDescription>
                    Evolução das vendas em {periodLabel(period).toLowerCase()}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Faturamento</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
                      <XAxis 
                        dataKey="day" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(v) => `R$${v >= 1000 ? (v/1000).toFixed(1) + 'k' : v}`}
                      />
                      <RTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border border-border shadow-xl rounded-xl p-3 text-xs">
                                <p className="font-bold mb-1 text-muted-foreground">{payload[0].payload.day}</p>
                                <p className="text-primary font-black text-sm">{fmtBRL(payload[0].value as number)}</p>
                                <p className="text-muted-foreground mt-0.5">{payload[0].payload.pedidos} pedidos</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="faturamento"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        fill="url(#revenueGrad)"
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <CreditCard className="h-5 w-5 text-primary" /> Métodos de Pagamento
                </CardTitle>
                <CardDescription>Distribuição de pedidos por forma de pagamento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentChartData}
                        innerRadius={60}
                        outerRadius={80}
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black">{currentMetrics.count}</span>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Total</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {paymentChartData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/40">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-muted-foreground truncate uppercase">{item.name}</div>
                        <div className="text-sm font-black">{item.value} <span className="text-[10px] font-normal text-muted-foreground">({((item.value / (currentMetrics.count || 1)) * 100).toFixed(0)}%)</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ========== RANKINGS & OPERATIONAL ========== */}
          <section className="grid gap-6 lg:grid-cols-2">
            <RankingCard
              title="Top 10 Produtos"
              icon={Trophy}
              items={rankings.top}
              emptyText="Nenhum produto vendido no período."
            />
            
            <div className="grid gap-6">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Activity className="h-5 w-5 text-primary" /> Resumo da Operação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Clock className="h-3.5 w-3.5" /> Horário de Pico
                      </div>
                      <div className="text-xl font-black">
                        {peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00h` : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-bold uppercase">
                        {peakHour ? `${peakHour.count} pedidos nesta hora` : "Sem dados suficientes"}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Star className="h-3.5 w-3.5" /> Saúde Financeira
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                          healthStatus === "Saudável" ? "bg-green-500" : healthStatus === "Atenção" ? "bg-yellow-500" : "bg-red-500"
                        }`} />
                        <span className="text-lg font-black">{healthStatus}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-bold uppercase truncate">
                        Status do faturamento mensal
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3 pt-2">
                    <SummaryRow icon={DollarSign} label="Subtotal de Vendas" value={fmtBRL(currentMetrics.subtotal)} />
                    <SummaryRow icon={Truck} label="Taxas de Entrega" value={fmtBRL(currentMetrics.deliveryFees)} />
                    <SummaryRow icon={ShoppingBag} label="Faturamento Total" value={fmtBRL(currentMetrics.revenue)} highlight />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Sparkles className="h-5 w-5 text-primary" /> Insights Estratégicos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InsightCard
                    icon={Flame}
                    text={rankings.top[0] ? `Seu carro-chefe é ${rankings.top[0].name}. Considere criar combos em torno dele.` : "Analise seus produtos mais vendidos para criar ofertas matadoras."}
                  />
                  <InsightCard
                    icon={Zap}
                    text={currentMetrics.ticket < 60 ? "Seu ticket médio pode subir! Experimente sugerir bebidas ou sobremesas no checkout." : "Seu ticket médio está excelente! Continue mantendo a qualidade do mix."}
                  />
                  {peakHour && (
                    <InsightCard
                      icon={Clock}
                      text={`O pico das ${peakHour.hour}h exige equipe completa. Use promoções para atrair clientes em horários mais calmos.`}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ========== RECENT ORDERS TABLE ========== */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" /> Últimos Pedidos no Período
              </h2>
              <Badge variant="outline">{ordersInPeriod.length} resultados</Badge>
            </div>
            
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[100px]">Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersInPeriod.slice(0, 10).map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-bold text-primary">#{order.order_number}</TableCell>
                      <TableCell className="font-semibold">{order.customer_name || "Cliente Final"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {format(new Date(order.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-[10px] uppercase tracking-wider">
                          {normalizePaymentMethod(order.payment_method)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] uppercase font-bold ${
                            order.status === "entregue" ? "border-green-500 text-green-600" : "border-blue-500 text-blue-600"
                          }`}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black">{fmtBRL(order.total)}</TableCell>
                    </TableRow>
                  ))}
                  {ordersInPeriod.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Nenhum pedido encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {ordersInPeriod.length > 10 && (
                <div className="p-4 text-center border-t border-border/60">
                  <p className="text-xs text-muted-foreground">Exibindo os 10 pedidos mais recentes de um total de {ordersInPeriod.length}.</p>
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

// ============ Sub-components ============

function KpiCard({
  title,
  value,
  trend,
  icon: Icon,
  description,
  highlight,
}: {
  title: string;
  value: string;
  trend?: number | null;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 border-border/60 ${highlight ? 'bg-primary/5 border-primary/20' : ''}`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-2.5 rounded-2xl ${highlight ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' : 'bg-muted/50 text-foreground'}`}>
            <Icon className="h-5 w-5" />
          </div>
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-0.5 text-[10px] font-black px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-black tracking-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RankingCard({
  title,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<{ name: string; qty: number; revenue: number; share: number }>;
  emptyText: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-16 text-center">{emptyText}</div>
        ) : (
          <div className="divide-y divide-border/40">
            {items.map((it, i) => (
              <div key={it.name} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black shrink-0 ${
                      i === 0 ? "bg-yellow-400 text-yellow-950 shadow-sm" : 
                      i === 1 ? "bg-slate-300 text-slate-800" : 
                      i === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </div>
                    <span className="font-bold text-sm truncate">{it.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-primary">{it.qty}x</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">{fmtBRL(it.revenue)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(it.share, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">
                    {it.share.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  icon: Icon,
  highlight
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl ${highlight ? 'bg-primary/5 border border-primary/20' : 'bg-muted/20 border border-border/40'}`}>
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-tight">
        <Icon className={`h-4 w-4 ${highlight ? 'text-primary' : ''}`} />
        {label}
      </div>
      <span className={`text-sm font-black ${highlight ? 'text-primary text-lg' : ''}`}>{value}</span>
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
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors border border-border/40 group">
      <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 group-hover:scale-110 transition-transform">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs leading-relaxed text-foreground/90 font-medium">{text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent text-center space-y-6">
      <div className="p-6 rounded-3xl bg-primary/10 relative">
        <div className="absolute inset-0 animate-pulse bg-primary/20 rounded-3xl blur-xl" />
        <Calculator className="h-12 w-12 text-primary relative z-10" />
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-2xl font-black tracking-tight">Painel pronto para decolar!</h3>
        <p className="text-sm text-muted-foreground">
          Assim que seus primeiros pedidos forem recebidos, este dashboard se transformará em uma central de inteligência financeira com gráficos, rankings e métricas reais.
        </p>
      </div>
      <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
        Tentar Atualizar
      </Button>
    </div>
  );
}



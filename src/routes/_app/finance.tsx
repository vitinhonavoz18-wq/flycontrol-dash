import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  TrendingUp, 
  DollarSign, 
  Calendar,
  AlertCircle,
  Trophy,
  Calculator,
  ArrowUpRight,
  Package,
  ArrowRight,
  Filter,
  ArrowDownWideEqual,
  Star,
  Activity,
  ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subDays, 
  format, 
  isSameDay 
} from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/finance" as any)({ component: Finance });

type Period = "today" | "week" | "month" | "7days" | "30days" | "custom";

type FinancialData = {
  pizzeria_id: string;
  pizzeria_name: string;
  owner_id: uuid;
  revenue: number;
  orders_count: number;
  ticket_avg: number;
  last_order_at: string | null;
  status: string;
};

type PizzeriaSummary = {
  pizzeria_name: string;
  revenue_month: number;
  orders_month: number;
  best_day_date: string | null;
  best_day_revenue: number;
  last_order_at: string | null;
};

function Finance() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<FinancialData[]>([]);
  const [summary, setSummary] = useState<PizzeriaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>("revenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter specific to Admin
  const [selectedPizzeriaId, setSelectedPizzeriaId] = useState<string>("all");

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/login" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, isSuperAdmin, period, selectedPizzeriaId]);

  async function loadData() {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period);
      
      // 1. Get period metrics for all (or filtered) pizzerias
      const { data: metricsData, error: metricsError } = await supabase.rpc('get_period_metrics', {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString()
      });
      
      if (metricsError) throw metricsError;

      const sanitizedData = (metricsData || []).map((m: any) => ({
        ...m,
        revenue: Number(m.revenue || 0),
        orders_count: Number(m.orders_count || 0),
        ticket_avg: Number(m.ticket_avg || 0)
      }));
      setData(sanitizedData);

      // 2. If it's a single pizzeria or user view, get detailed summary
      const targetPizzeriaId = !isSuperAdmin ? sanitizedData[0]?.pizzeria_id : (selectedPizzeriaId !== "all" ? selectedPizzeriaId : null);
      
      if (targetPizzeriaId) {
        const { data: summaryData, error: summaryError } = await supabase.rpc('get_pizzeria_financial_summary', {
          p_pizzeria_id: targetPizzeriaId
        });
        if (!summaryError && summaryData?.[0]) {
          setSummary({
            ...summaryData[0],
            revenue_month: Number(summaryData[0].revenue_month || 0),
            orders_month: Number(summaryData[0].orders_month || 0),
            best_day_revenue: Number(summaryData[0].best_day_revenue || 0)
          });
        }
      } else {
        setSummary(null);
      }

    } catch (error: any) {
      console.error("Finance load error:", error);
      toast.error("Erro ao carregar dados financeiros: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  function getPeriodDates(p: Period) {
    const now = new Date();
    switch (p) {
      case "today": return { start: startOfDay(now), end: endOfDay(now) };
      case "week": return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "7days": return { start: subDays(now, 7), end: now };
      case "30days": return { start: subDays(now, 30), end: now };
      default: return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const totals = useMemo(() => {
    return data.reduce((acc, curr) => ({
      revenue: acc.revenue + curr.revenue,
      orders: acc.orders + curr.orders_count,
    }), { revenue: 0, orders: 0 });
  }, [data]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const valA = (a as any)[sortBy] ?? 0;
      const valB = (b as any)[sortBy] ?? 0;
      return sortOrder === "desc" ? valB - valA : valA - valB;
    });
  }, [data, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  if (loading && !data.length) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-primary" /> Gestão Financeira
          </h1>
          <p className="text-muted-foreground">Visão estratégica e faturamento bruto em tempo real.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Activity className="h-4 w-4" />
                  {selectedPizzeriaId === "all" ? "Todas as Pizzarias" : data.find(p => p.pizzeria_id === selectedPizzeriaId)?.pizzeria_name || "Selecionar..."}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setSelectedPizzeriaId("all")}>
                  Todas as Pizzarias
                </DropdownMenuItem>
                {data.map(p => (
                  <DropdownMenuItem key={p.pizzeria_id} onClick={() => setSelectedPizzeriaId(p.pizzeria_id)}>
                    {p.pizzeria_name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {getPeriodLabel(period)}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPeriod("week")}>Esta Semana</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPeriod("month")}>Este Mês</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPeriod("7days")}>Últimos 7 dias</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPeriod("30days")}>Últimos 30 dias</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="primary" size="sm" className="gap-2 shadow-lg" onClick={loadData}>
            <Activity className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-10">
        {isSuperAdmin && selectedPizzeriaId === "all" ? (
          <AdminView 
            data={sortedData} 
            totals={totals} 
            formatCurrency={formatCurrency} 
            handleSort={handleSort}
            sortBy={sortBy}
            sortOrder={sortOrder}
            periodLabel={getPeriodLabel(period)}
          />
        ) : (
          <OwnerView 
            pizzeria={data[0] || {} as FinancialData} 
            summary={summary}
            formatCurrency={formatCurrency}
            periodLabel={getPeriodLabel(period)}
          />
        )}
      </div>
      
      {data.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center p-20 rounded-2xl border border-dashed border-border bg-muted/30 text-center space-y-4">
          <div className="p-4 rounded-full bg-primary/10">
            <AlertCircle className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Sem dados no período</h3>
            <p className="text-muted-foreground max-w-xs mx-auto">
              Ainda não há pedidos suficientes para gerar a gestão financeira neste intervalo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getPeriodLabel(p: Period) {
  switch (p) {
    case "today": return "Hoje";
    case "week": return "Esta Semana";
    case "month": return "Este Mês";
    case "7days": return "Últimos 7 dias";
    case "30days": return "Últimos 30 dias";
    default: return "Período";
  }
}

function AdminView({ data, totals, formatCurrency, handleSort, sortBy, sortOrder, periodLabel }: any) {
  return (
    <div className="space-y-8">
      {/* Global Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title={`TOTAL FATURADO ${periodLabel.toUpperCase()}`}
          value={formatCurrency(totals.revenue)}
          subtitle="Somando todas as pizzarias"
          icon={DollarSign}
          highlight
        />
        <MetricCard 
          title={`TOTAL DE PEDIDOS ${periodLabel.toUpperCase()}`}
          value={totals.orders}
          subtitle="Volume total de vendas"
          icon={Package}
        />
        <MetricCard 
          title="TICKET MÉDIO GERAL"
          value={formatCurrency(totals.orders > 0 ? totals.revenue / totals.orders : 0)}
          subtitle="Média por pedido"
          icon={TrendingUp}
        />
        <MetricCard 
          title="PIZZARIAS ATIVAS"
          value={data.length}
          subtitle="Cadastradas no sistema"
          icon={Calculator}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Table Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ArrowDownWideEqual className="h-5 w-5 text-primary" />
              Desempenho por Pizzaria
            </h2>
          </div>
          <Card className="overflow-hidden border-border shadow-md">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('pizzeria_name')}>
                    Pizzaria {sortBy === 'pizzeria_name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('orders_count')}>
                    Pedidos {sortBy === 'orders_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('revenue')}>
                    Faturamento {sortBy === 'revenue' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p: any) => (
                  <TableRow key={p.pizzeria_id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{p.pizzeria_name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{p.status === 'active' ? 'Ativa' : 'Pausada'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{p.orders_count}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatCurrency(p.revenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(p.ticket_avg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Rankings Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Ranking das Pizzarias
          </h2>
          <Card className="p-5 border-primary/20 shadow-md">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" /> Top Faturamento {periodLabel}
                </h3>
                <div className="space-y-3">
                  {[...data].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((p, i) => (
                    <div key={p.pizzeria_id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-yellow-500 text-white' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium group-hover:text-primary transition-colors truncate max-w-[120px]">{p.pizzeria_name}</span>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" /> Top Pedidos {periodLabel}
                </h3>
                <div className="space-y-3">
                  {[...data].sort((a, b) => b.orders_count - a.orders_count).slice(0, 5).map((p, i) => (
                    <div key={p.pizzeria_id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium group-hover:text-primary transition-colors truncate max-w-[120px]">{p.pizzeria_name}</span>
                      </div>
                      <span className="text-sm font-bold">{p.orders_count} pedidos</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OwnerView({ pizzeria, summary, formatCurrency, periodLabel }: any) {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
      {/* Personal Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title={`SEU FATURAMENTO ${periodLabel.toUpperCase()}`}
          value={formatCurrency(pizzeria.revenue || 0)}
          subtitle="Faturamento bruto real"
          icon={DollarSign}
          highlight
        />
        <MetricCard 
          title={`SEUS PEDIDOS ${periodLabel.toUpperCase()}`}
          value={pizzeria.orders_count || 0}
          subtitle="Volume de vendas"
          icon={Package}
        />
        <MetricCard 
          title="SEU TICKET MÉDIO"
          value={formatCurrency(pizzeria.ticket_avg || 0)}
          subtitle="Média por pedido"
          icon={TrendingUp}
        />
        <MetricCard 
          title="ÚLTIMA VENDA"
          value={pizzeria.last_order_at ? format(new Date(pizzeria.last_order_at), "HH:mm") : "--:--"}
          subtitle={pizzeria.last_order_at ? format(new Date(pizzeria.last_order_at), "dd/MM") : "Sem pedidos"}
          icon={Calendar}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Summary Card */}
        <Card className="overflow-hidden border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              Resumo da Pizzaria
            </CardTitle>
            <CardDescription>Visão geral de performance consolidada.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b">
                <div className="text-sm text-muted-foreground font-medium uppercase tracking-tight">Nome da Pizzaria</div>
                <div className="font-bold text-lg text-primary">{pizzeria.pizzeria_name || "Sua Pizzaria"}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Faturado (Mês)</div>
                  <div className="text-xl font-black">{formatCurrency(summary?.revenue_month || 0)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Pedidos (Mês)</div>
                  <div className="text-xl font-black">{summary?.orders_month || 0}</div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-dashed">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <span className="text-muted-foreground">Melhor dia de vendas:</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-bold">{summary?.best_day_date ? format(new Date(summary.best_day_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR }) : "--"}</span>
                    <span className="text-[10px] text-success font-bold">{formatCurrency(summary?.best_day_revenue || 0)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Status financeiro:</span>
                  </div>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 uppercase text-[9px] font-bold">Saudável</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Último pedido:</span>
                  </div>
                  <span className="text-xs font-medium">{summary?.last_order_at ? format(new Date(summary.last_order_at), "dd/MM/yyyy HH:mm") : "Nenhum pedido"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Growth/Motivation Card */}
        <div className="flex flex-col justify-center gap-6 p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10">
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Cresça com o FlyControl</h3>
            <p className="text-muted-foreground">O faturamento bruto de <span className="font-bold text-foreground">{formatCurrency(summary?.revenue_month || 0)}</span> este mês é um excelente indicador de tração.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/50 border border-white shadow-sm">
              <ArrowUpRight className="h-5 w-5 text-success mb-2" />
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Potencial</div>
              <div className="text-sm font-bold">Aumente o ticket médio</div>
            </div>
            <div className="p-4 rounded-xl bg-white/50 border border-white shadow-sm">
              <ArrowRight className="h-5 w-5 text-primary mb-2" />
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Dica</div>
              <div className="text-sm font-bold">Analise seu melhor dia</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, highlight = false }: any) {
  return (
    <Card className={`relative overflow-hidden group transition-all duration-300 hover:shadow-xl ${highlight ? "border-primary/50 shadow-md bg-primary/5" : "border-border hover:border-primary/30"}`}>
      {highlight && <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />}
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-widest group-hover:text-primary transition-colors">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-lg transition-colors ${highlight ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black tracking-tighter">{value}</div>
        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 font-medium italic">
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted ${className}`} />;
}

type uuid = string;

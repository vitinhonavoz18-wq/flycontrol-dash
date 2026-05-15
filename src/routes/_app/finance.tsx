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
  BarChart3,
  Star,
  Activity,
  ChevronDown,
  Clock
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
} from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/finance" as any)({ component: Finance });

type Period = "today" | "week" | "month" | "7days" | "30days" | "custom";

type FinancialData = {
  pizzeria_id: string;
  pizzeria_name: string;
  owner_id: string;
  status: string;
  revenue_day: number;
  orders_day: number;
  ticket_avg_day: number;
  revenue_week: number;
  orders_week: number;
  ticket_avg_week: number;
  revenue_month: number;
  orders_month: number;
  ticket_avg_month: number;
  last_order_at: string | null;
};

type GlobalTotals = {
  total_revenue_day: number;
  total_orders_day: number;
  total_revenue_week: number;
  total_orders_week: number;
  total_revenue_month: number;
  total_orders_month: number;
  ticket_avg_month: number;
};

type RankingItem = {
  pizzeria_name: string;
  revenue_month: number;
  orders_month: number;
  revenue_day: number;
  orders_day: number;
};

function Finance() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<FinancialData[]>([]);
  const [globalTotals, setGlobalTotals] = useState<GlobalTotals | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
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
      // 1. Load basic pizzeria metrics (Today/Week/Month)
      const { data: metricsData, error: metricsError } = await supabase
        .from('pizzeria_financial_metrics')
        .select('*');
      
      if (metricsError) throw metricsError;

      const sanitizedData = (metricsData || []).map((m: any) => ({
        ...m,
        revenue_day: Number(m.revenue_day || 0),
        orders_day: Number(m.orders_day || 0),
        revenue_week: Number(m.revenue_week || 0),
        orders_week: Number(m.orders_week || 0),
        revenue_month: Number(m.revenue_month || 0),
        orders_month: Number(m.orders_month || 0),
        ticket_avg_day: Number(m.ticket_avg_day || 0),
        ticket_avg_week: Number(m.ticket_avg_week || 0),
        ticket_avg_month: Number(m.ticket_avg_month || 0)
      }));
      setData(sanitizedData);

      // 2. Load global totals if Admin
      if (isSuperAdmin) {
        const { data: globalData, error: globalError } = await supabase
          .from('admin_global_financial_metrics')
          .select('*')
          .single();
        
        if (!globalError && globalData) {
          setGlobalTotals({
            total_revenue_day: Number(globalData.total_revenue_day || 0),
            total_orders_day: Number(globalData.total_orders_day || 0),
            total_revenue_week: Number(globalData.total_revenue_week || 0),
            total_orders_week: Number(globalData.total_orders_week || 0),
            total_revenue_month: Number(globalData.total_revenue_month || 0),
            total_orders_month: Number(globalData.total_orders_month || 0),
            ticket_avg_month: Number(globalData.ticket_avg_month || 0)
          });
        }

        // 3. Load ranking
        const { data: rankingData, error: rankingError } = await supabase.rpc('get_pizzerias_ranking', { p_limit: 5 });
        if (!rankingError && rankingData) {
          setRanking(rankingData);
        }
      }

    } catch (error: any) {
      console.error("Finance load error:", error);
      toast.error("Erro ao carregar dados financeiros: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const currentPizzeria = useMemo(() => {
    if (selectedPizzeriaId === "all") return data[0] || null;
    return data.find(p => p.pizzeria_id === selectedPizzeriaId) || data[0] || null;
  }, [data, selectedPizzeriaId]);

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
          
          <Button variant="default" size="sm" className="gap-2 shadow-lg" onClick={loadData}>
            <Activity className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="space-y-10">
        {isSuperAdmin && selectedPizzeriaId === "all" ? (
          <AdminView 
            data={data} 
            totals={globalTotals} 
            ranking={ranking}
            formatCurrency={formatCurrency} 
          />
        ) : (
          <OwnerView 
            pizzeria={currentPizzeria} 
            formatCurrency={formatCurrency}
          />
        )}
      </div>
      
      {data.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center p-20 rounded-2xl border border-dashed border-border bg-muted/30 text-center space-y-4">
          <div className="p-4 rounded-full bg-primary/10">
            <AlertCircle className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Sem dados suficientes</h3>
            <p className="text-muted-foreground max-w-xs mx-auto">
              Ainda não há pedidos suficientes para gerar a gestão financeira.
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

function AdminView({ data, totals, ranking, formatCurrency }: any) {
  if (!totals) return null;

  return (
    <div className="space-y-8">
      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard 
          title="TOTAL FATURADO HOJE"
          value={formatCurrency(totals.total_revenue_day)}
          subtitle="Soma de todas as pizzarias hoje"
          icon={DollarSign}
          highlight
        />
        <MetricCard 
          title="FATURAMENTO DA SEMANA"
          value={formatCurrency(totals.total_revenue_week)}
          subtitle="Acumulado da semana atual"
          icon={TrendingUp}
        />
        <MetricCard 
          title="FATURAMENTO DO MÊS"
          value={formatCurrency(totals.total_revenue_month)}
          subtitle="Acumulado do mês atual"
          icon={Calendar}
          highlight
        />
        <MetricCard 
          title="PEDIDOS HOJE"
          value={totals.total_orders_day}
          subtitle="Volume total hoje"
          icon={Package}
        />
        <MetricCard 
          title="PEDIDOS NA SEMANA"
          value={totals.total_orders_week}
          subtitle="Volume total na semana"
          icon={Activity}
        />
        <MetricCard 
          title="PEDIDOS NO MÊS"
          value={totals.total_orders_month}
          subtitle="Volume total no mês"
          icon={Calculator}
        />
        <MetricCard 
          title="TICKET MÉDIO GERAL"
          value={formatCurrency(totals.ticket_avg_month)}
          subtitle="Média mensal por pedido"
          icon={Star}
        />
        <MetricCard 
          title="PIZZARIAS ATIVAS"
          value={data.length}
          subtitle="Total gerenciado"
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Performance Table */}
        <Card className="lg:col-span-2 overflow-hidden border-border shadow-md">
          <CardHeader className="bg-muted/50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Desempenho por Pizzaria
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Pizzaria</TableHead>
                  <TableHead className="text-right">Pedidos Hoje</TableHead>
                  <TableHead className="text-right">Faturamento Hoje</TableHead>
                  <TableHead className="text-right">Pedidos Semana</TableHead>
                  <TableHead className="text-right">Faturamento Semana</TableHead>
                  <TableHead className="text-right">Pedidos Mês</TableHead>
                  <TableHead className="text-right">Faturamento Mês</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p: any) => (
                  <TableRow key={p.pizzeria_id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-bold">{p.pizzeria_name}</TableCell>
                    <TableCell className="text-right">{p.orders_day}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{formatCurrency(p.revenue_day)}</TableCell>
                    <TableCell className="text-right">{p.orders_week}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.revenue_week)}</TableCell>
                    <TableCell className="text-right font-bold">{p.orders_month}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatCurrency(p.revenue_month)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.ticket_avg_month)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className={p.status === 'active' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20' : ''}>
                        {p.status === 'active' ? 'Ativa' : 'Pausada'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Ranking Section */}
        <div className="space-y-6">
          <Card className="p-6 border-primary/20 shadow-lg bg-gradient-to-b from-primary/5 to-transparent">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Ranking das Pizzarias
            </h3>
            
            <div className="space-y-8">
              <RankingList 
                title="Top Faturamento (Mês)" 
                items={ranking.map(r => ({ name: r.pizzeria_name, value: formatCurrency(r.revenue_month) }))} 
                icon={DollarSign}
                iconColor="text-green-500"
              />
              <RankingList 
                title="Top Pedidos (Mês)" 
                items={ranking.sort((a, b) => Number(b.orders_month) - Number(a.orders_month)).map(r => ({ name: r.pizzeria_name, value: `${r.orders_month} pedidos` }))} 
                icon={Package}
                iconColor="text-primary"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RankingList({ title, items, icon: Icon, iconColor }: any) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} /> {title}
      </h4>
      <div className="space-y-3">
        {items.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-yellow-500 text-white' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className="text-sm font-medium group-hover:text-primary transition-colors truncate max-w-[150px]">{item.name}</span>
            </div>
            <span className="text-sm font-bold">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OwnerView({ pizzeria, formatCurrency }: any) {
  if (!pizzeria) return null;

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="SEU FATURAMENTO HOJE"
          value={formatCurrency(pizzeria.revenue_day)}
          subtitle="Faturamento bruto real hoje"
          icon={DollarSign}
          highlight
        />
        <MetricCard 
          title="FATURAMENTO DA SEMANA"
          value={formatCurrency(pizzeria.revenue_week)}
          subtitle="Acumulado da semana atual"
          icon={TrendingUp}
        />
        <MetricCard 
          title="FATURAMENTO DO MÊS"
          value={formatCurrency(pizzeria.revenue_month)}
          subtitle="Acumulado do mês atual"
          icon={Calendar}
          highlight
        />
        <MetricCard 
          title="SEUS PEDIDOS HOJE"
          value={pizzeria.orders_day}
          subtitle="Volume de vendas hoje"
          icon={Package}
        />
        <MetricCard 
          title="PEDIDOS NA SEMANA"
          value={pizzeria.orders_week}
          subtitle="Volume de vendas na semana"
          icon={Activity}
        />
        <MetricCard 
          title="PEDIDOS NO MÊS"
          value={pizzeria.orders_month}
          subtitle="Volume de vendas no mês"
          icon={Calculator}
        />
        <MetricCard 
          title="TICKET MÉDIO DO DIA"
          value={formatCurrency(pizzeria.ticket_avg_day)}
          subtitle="Média por pedido hoje"
          icon={Star}
        />
        <MetricCard 
          title="TICKET MÉDIO DO MÊS"
          value={formatCurrency(pizzeria.ticket_avg_month)}
          subtitle="Média por pedido no mês"
          icon={Star}
        />
      </div>

      {/* Resumo Card */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="overflow-hidden border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5 pb-4 border-b">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              Resumo da Pizzaria
            </CardTitle>
            <CardDescription>Visão geral de performance consolidada.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b">
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-tight">Nome da Pizzaria</div>
              <div className="font-bold text-lg text-primary">{pizzeria.pizzeria_name}</div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Faturado (Mês)</div>
                <div className="text-2xl font-black">{formatCurrency(pizzeria.revenue_month)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Pedidos (Mês)</div>
                <div className="text-2xl font-black">{pizzeria.orders_month}</div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-dashed">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Último pedido:</span>
                </div>
                <span className="text-sm font-bold">
                  {pizzeria.last_order_at ? format(new Date(pizzeria.last_order_at), "dd/MM/yyyy HH:mm") : "Nenhum pedido"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Status Financeiro Geral:</span>
                </div>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 uppercase text-[10px] font-black">
                  Saudável
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Motivational Card */}
        <div className="flex flex-col justify-center gap-6 p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Trophy className="h-24 w-24 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Cresça com o FlyControl</h3>
            <p className="text-muted-foreground leading-relaxed">
              Seu faturamento bruto de <span className="font-bold text-foreground">{formatCurrency(pizzeria.revenue_month)}</span> este mês mostra um crescimento sólido. Continue monitorando seus indicadores para otimizar suas operações.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-background/50 border border-border shadow-sm">
              <ArrowUpRight className="h-5 w-5 text-green-500 mb-2" />
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Dica</div>
              <div className="text-sm font-bold">Aumente seu Ticket Médio</div>
            </div>
            <div className="p-4 rounded-xl bg-background/50 border border-border shadow-sm">
              <ArrowRight className="h-5 w-5 text-primary mb-2" />
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Próximo Passo</div>
              <div className="text-sm font-bold">Veja os itens mais vendidos</div>
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

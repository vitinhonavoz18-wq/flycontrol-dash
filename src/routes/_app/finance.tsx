import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  DollarSign, 
  Calendar,
  AlertCircle,
  Trophy,
  Calculator,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/finance" as any)({ component: Finance });

type FinancialMetrics = {
  pizzeria_id: string;
  pizzeria_name: string;
  revenue_day: number;
  orders_day: number;
  ticket_avg_day: number;
  revenue_week: number;
  orders_week: number;
  ticket_avg_week: number;
  revenue_month: number;
  orders_month: number;
  ticket_avg_month: number;
};

type GlobalMetrics = {
  total_revenue_day: number;
  total_orders_day: number;
  total_revenue_week: number;
  total_orders_week: number;
  total_revenue_month: number;
  total_orders_month: number;
};

function Finance() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [metrics, setMetrics] = useState<FinancialMetrics[]>([]);
  const [global, setGlobal] = useState<GlobalMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/login" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (user) loadData();
  }, [user, isSuperAdmin]);

  async function loadData() {
    setLoading(true);
    try {
      // Load individual metrics
      const { data: metricsData, error: metricsError } = await supabase.rpc('get_my_financial_metrics');
      
      if (metricsError) throw metricsError;
      setMetrics(metricsData || []);

      // Load global metrics if admin
      if (isSuperAdmin) {
        const { data: globalData, error: globalError } = await supabase.rpc('get_admin_global_metrics');
        if (globalError) throw globalError;
        setGlobal(globalData?.[0] || null);
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

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestão Financeira</h1>
        <p className="text-muted-foreground">Acompanhe o desempenho bruto das suas pizzarias em tempo real.</p>
      </div>

      {isSuperAdmin && global && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h2 className="text-xl font-semibold uppercase tracking-wider text-muted-foreground/80 text-sm">Visão Geral (Todas as Pizzarias)</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard 
              title="TOTAL FATURADO HOJE"
              value={formatCurrency(global.total_revenue_day)}
              subtitle={`${global.total_orders_day} pedidos hoje`}
              icon={Calendar}
              trend="Faturamento Bruto"
            />
            <MetricCard 
              title="TOTAL FATURADO NA SEMANA"
              value={formatCurrency(global.total_revenue_week)}
              subtitle={`${global.total_orders_week} pedidos na semana`}
              icon={TrendingUp}
              trend="Faturamento Bruto"
            />
            <MetricCard 
              title="TOTAL FATURADO NO MÊS"
              value={formatCurrency(global.total_revenue_month)}
              subtitle={`${global.total_orders_month} pedidos no mês`}
              icon={DollarSign}
              trend="Faturamento Bruto"
              highlight
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Ranking de Faturamento (Mês Atual)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...metrics].sort((a, b) => b.revenue_month - a.revenue_month).map((m, i) => (
                  <div key={m.pizzeria_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </div>
                      <span className="text-sm font-medium">{m.pizzeria_name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">{m.orders_month} pedidos</span>
                      <span className="text-sm font-bold">{formatCurrency(m.revenue_month)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold uppercase tracking-wider text-muted-foreground/80 text-sm">
            {isSuperAdmin ? "Detalhamento por Unidade" : "Minha Pizzaria"}
          </h2>
        </div>

        {metrics.map((m) => (
          <div key={m.pizzeria_id} className="space-y-4">
            {isSuperAdmin && (
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary">{m.pizzeria_name}</h3>
                <Badge variant="outline">Unidade Ativa</Badge>
              </div>
            )}
            
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold uppercase">Hoje</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(m.revenue_day)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pedidos:</span>
                    <span className="font-medium">{m.orders_day}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ticket Médio:</span>
                    <span className="font-medium">{formatCurrency(m.ticket_avg_day)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold uppercase">Esta Semana</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(m.revenue_week)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pedidos:</span>
                    <span className="font-medium">{m.orders_week}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ticket Médio:</span>
                    <span className="font-medium">{formatCurrency(m.ticket_avg_week)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className={!isSuperAdmin ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold uppercase">Este Mês</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrency(m.revenue_month)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pedidos:</span>
                    <span className="font-medium">{m.orders_month}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ticket Médio:</span>
                    <span className="font-medium">{formatCurrency(m.ticket_avg_month)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ))}

        {metrics.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-medium text-muted-foreground">Nenhum dado financeiro disponível</h3>
            <p className="text-sm text-muted-foreground">Novos pedidos aparecerão aqui assim que forem realizados.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, trend, highlight = false }: any) {
  return (
    <Card className={highlight ? "border-primary shadow-md bg-primary/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {trend && <span className="text-success flex items-center">{trend}</span>}
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

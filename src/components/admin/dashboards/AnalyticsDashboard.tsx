import { useAdminGlobalMetrics } from "@/hooks/admin/use-admin-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { useAdminPizzerias } from "@/hooks/admin/use-admin-pizzerias";

export const AnalyticsDashboard = () => {
  const { data: metrics, isLoading: loadingMetrics } = useAdminGlobalMetrics();
  const { data: pizzerias, isLoading: loadingPizzerias } = useAdminPizzerias();

  if (loadingMetrics || loadingPizzerias) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  const chartData = pizzerias?.map(p => ({
    name: p.pizzeria_name,
    orders: p.orders_month || 0,
    revenue: p.revenue_month || 0
  })).sort((a, b) => b.orders - a.orders).slice(0, 5) || [];

  const statusData = [
    { name: "Abertas", value: pizzerias?.filter(p => p.status === "active").length || 0 },
    { name: "Fechadas/Inativas", value: pizzerias?.filter(p => p.status !== "active").length || 0 }
  ];

  const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#3b82f6"];

  return (
    <div className="p-8 pb-20">
      <h1 className="text-3xl font-bold mb-4">Insights Globais</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lojas Cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pizzerias?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lojas Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {pizzerias?.filter(p => p.status === "active").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_orders_day || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {Number(metrics?.total_revenue_day || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Lojas (Pedidos/Mês)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="orders" fill="#ff7a00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status das Lojas</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};



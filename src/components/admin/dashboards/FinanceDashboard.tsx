import { useAdminGlobalMetrics } from "@/hooks/admin/use-admin-metrics";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPizzerias } from "@/hooks/admin/use-admin-pizzerias";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const FinanceDashboard = () => {
  const { data: globalData, isLoading: loadingGlobal } = useAdminGlobalMetrics();
  const { data: pizzeriasData, isLoading: loadingPizzerias } = useAdminPizzerias();
  const [period, setPeriod] = useState("month");

  if (loadingGlobal || loadingPizzerias) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  const sortedPizzerias = useMemo(() => {
    if (!pizzeriasData) return [];
    const key = period === "day" ? "revenue_day" : period === "week" ? "revenue_week" : "revenue_month";
    return [...pizzeriasData].sort((a, b) => (Number(b[key as keyof typeof b]) || 0) - (Number(a[key as keyof typeof a]) || 0));
  }, [pizzeriasData, period]);

  const metrics = {
    revenue: period === "day" ? globalData?.total_revenue_day : period === "week" ? globalData?.total_revenue_week : globalData?.total_revenue_month,
    orders: period === "day" ? globalData?.total_orders_day : period === "week" ? globalData?.total_orders_week : globalData?.total_orders_month,
    avg: period === "month" ? globalData?.ticket_avg_month : (period === "day" ? (globalData?.total_orders_day ? globalData.total_revenue_day! / globalData.total_orders_day : 0) : 0)
  };

  return (
    <div className="p-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">Financeiro Global</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Hoje</SelectItem>
            <SelectItem value="week">Últimos 7 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Bruto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {Number(metrics.revenue || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.orders || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {Number(metrics.avg || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg p-6 shadow-sm overflow-x-auto">
        <h2 className="text-xl font-semibold mb-4">Ranking por Loja ({period === 'day' ? 'Hoje' : period === 'week' ? '7 dias' : 'Mês'})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead>Faturamento</TableHead>
              <TableHead>Ticket Médio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPizzerias.map((p) => {
              const orders = period === "day" ? p.orders_day : period === "week" ? p.orders_week : p.orders_month;
              const revenue = period === "day" ? p.revenue_day : period === "week" ? p.revenue_week : p.revenue_month;
              const avg = period === "day" ? p.ticket_avg_day : period === "week" ? p.ticket_avg_week : p.ticket_avg_month;
              
              return (
                <TableRow key={p.pizzeria_id}>
                  <TableCell className="font-medium">{p.pizzeria_name}</TableCell>
                  <TableCell>{orders || 0}</TableCell>
                  <TableCell className="text-emerald-600 font-medium">R$ {Number(revenue || 0).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(avg || 0).toFixed(2)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};



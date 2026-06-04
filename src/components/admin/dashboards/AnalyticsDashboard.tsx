import { useAdminGlobalMetrics } from "@/hooks/admin/use-admin-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const AnalyticsDashboard = () => {
  const { data, isLoading } = useAdminGlobalMetrics();

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Insights Globais</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total_orders_day || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Receita Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {Number(data?.total_revenue_day || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pedidos (Mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total_orders_month || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio (Mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {Number(data?.ticket_avg_month || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


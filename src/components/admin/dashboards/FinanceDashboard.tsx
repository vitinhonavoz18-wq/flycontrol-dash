import { useAdminGlobalMetrics } from "@/hooks/admin/use-admin-metrics";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPizzerias } from "@/hooks/admin/use-admin-pizzerias";

export const FinanceDashboard = () => {
  const { data: globalData, isLoading: loadingGlobal } = useAdminGlobalMetrics();
  const { data: pizzeriasData, isLoading: loadingPizzerias } = useAdminPizzerias();

  if (loadingGlobal || loadingPizzerias) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Financeiro Global</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Bruto (Mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {Number(globalData?.total_revenue_month || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pedidos (Mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalData?.total_orders_month || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio (Mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {Number(globalData?.ticket_avg_month || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Ranking por Loja (Mês Atual)</h2>
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
            {pizzeriasData?.sort((a, b) => (b.revenue_month || 0) - (a.revenue_month || 0)).map((p) => (
              <TableRow key={p.pizzeria_id}>
                <TableCell className="font-medium">{p.pizzeria_name}</TableCell>
                <TableCell>{p.orders_month}</TableCell>
                <TableCell>R$ {Number(p.revenue_month || 0).toFixed(2)}</TableCell>
                <TableCell>R$ {Number(p.ticket_avg_month || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};


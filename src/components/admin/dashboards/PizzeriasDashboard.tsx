import { useAdminPizzerias } from "@/hooks/admin/use-admin-pizzerias";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const PizzeriasDashboard = () => {
  const { data, isLoading, error } = useAdminPizzerias();

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="p-8 text-destructive">Erro ao carregar lojas.</div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">FlyPizzarias</h1>
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pedidos (Hoje)</TableHead>
              <TableHead>Receita (Hoje)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((p) => (
              <TableRow key={p.pizzeria_id}>
                <TableCell className="font-medium">{p.pizzeria_name}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>
                    {p.status === "active" ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                <TableCell>{p.orders_day}</TableCell>
                <TableCell>R$ {Number(p.revenue_day || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};


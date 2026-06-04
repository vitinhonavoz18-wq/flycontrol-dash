import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

export const SubscriptionsDashboard = () => {
  const queryClient = useQueryClient();
  const { data: pizzerias, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pizzerias")
        .select("*")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleSuspension = async (id: string, currentStatus: string | null) => {
    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    const { error } = await supabase
      .from("pizzerias")
      .update({ subscription_status: newStatus })
      .eq("id", id);
    
    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
    } else {
      toast.success(`Loja ${newStatus === "suspended" ? "suspensa" : "reativada"} com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    }
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Clientes e Planos</h1>
      <div className="bg-card border rounded-lg p-6 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Dias Restantes</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pizzerias?.map((p) => {
              const daysLeft = p.subscription_expires_at 
                ? differenceInDays(new Date(p.subscription_expires_at), new Date()) 
                : null;
              
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    <div className="text-xs text-muted-foreground">/{p.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {p.subscription_plan || "Free"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={p.subscription_status === "active" ? "default" : "destructive"}
                      className="capitalize"
                    >
                      {p.subscription_status || "Trial"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.subscription_expires_at 
                      ? format(new Date(p.subscription_expires_at), "dd/MM/yyyy") 
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <span className={daysLeft !== null && daysLeft < 5 ? "text-destructive font-bold" : ""}>
                      {daysLeft !== null ? `${daysLeft} dias` : "N/A"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => toggleSuspension(p.id, p.subscription_status)}
                    >
                      {p.subscription_status === "suspended" ? "Reativar" : "Suspender"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};


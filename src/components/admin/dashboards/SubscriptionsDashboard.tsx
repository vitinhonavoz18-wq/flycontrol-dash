import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SubscriptionsDashboard = () => {
  const queryClient = useQueryClient();
  const [editingPizzeria, setEditingPizzeria] = useState<any>(null);
  
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPizzeria) return;

    const { error } = await supabase
      .from("pizzerias")
      .update({
        subscription_plan: editingPizzeria.subscription_plan,
        subscription_status: editingPizzeria.subscription_status,
        subscription_expires_at: editingPizzeria.subscription_expires_at,
        subscription_price: editingPizzeria.subscription_price,
        internal_notes: editingPizzeria.internal_notes
      })
      .eq("id", editingPizzeria.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Dados atualizados com sucesso!");
      setEditingPizzeria(null);
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    }
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8 pb-20">
      <h1 className="text-3xl font-bold mb-4">Clientes e Planos</h1>
      <div className="bg-card border rounded-lg p-6 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
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
                      variant={p.subscription_status === "active" ? "default" : p.subscription_status === "suspended" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {p.subscription_status || "Trial"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>
                        {p.subscription_expires_at 
                          ? format(new Date(p.subscription_expires_at), "dd/MM/yyyy") 
                          : "N/A"}
                      </span>
                      {daysLeft !== null && (
                        <span className={`text-[10px] ${daysLeft < 5 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                          {daysLeft < 0 ? "Vencido" : `${daysLeft} dias restantes`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    R$ {Number(p.subscription_price || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEditingPizzeria(p)}
                      >
                        Editar
                      </Button>
                      <Button 
                        variant={p.subscription_status === "suspended" ? "default" : "outline"} 
                        size="sm"
                        className={p.subscription_status !== "suspended" ? "text-destructive hover:text-destructive" : ""}
                        onClick={() => toggleSuspension(p.id, p.subscription_status)}
                      >
                        {p.subscription_status === "suspended" ? "Reativar" : "Suspender"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingPizzeria} onOpenChange={(open) => !open && setEditingPizzeria(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente: {editingPizzeria?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select 
                  value={editingPizzeria?.subscription_plan || "free"} 
                  onValueChange={(v) => setEditingPizzeria({...editingPizzeria, subscription_plan: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Teste Grátis</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editingPizzeria?.subscription_status || "active"} 
                  onValueChange={(v) => setEditingPizzeria({...editingPizzeria, subscription_status: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="trial">Em teste</SelectItem>
                    <SelectItem value="expired">Vencido</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input 
                  type="date" 
                  value={editingPizzeria?.subscription_expires_at ? format(new Date(editingPizzeria.subscription_expires_at), "yyyy-MM-dd") : ""}
                  onChange={(e) => setEditingPizzeria({...editingPizzeria, subscription_expires_at: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={editingPizzeria?.subscription_price || 0}
                  onChange={(e) => setEditingPizzeria({...editingPizzeria, subscription_price: parseFloat(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações Internas</Label>
              <Textarea 
                value={editingPizzeria?.internal_notes || ""}
                onChange={(e) => setEditingPizzeria({...editingPizzeria, internal_notes: e.target.value})}
                placeholder="Notas visíveis apenas para admin..."
                className="h-24"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingPizzeria(null)}>Cancelar</Button>
              <Button type="submit">Salvar Alterações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};



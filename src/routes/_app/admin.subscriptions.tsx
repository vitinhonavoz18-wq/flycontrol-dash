import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Users, 
  Store, 
  CreditCard, 
  Calendar, 
  Search, 
  MoreHorizontal, 
  ExternalLink, 
  Ban, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Clock
} from "lucide-react";
import { format, differenceInDays, isToday, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/admin/subscriptions")({ component: AdminSubscriptions });

const PLANS = [
  { value: "test", label: "Teste Grátis", price: 0 },
  { value: "starter", label: "Starter", price: 49.90 },
  { value: "pro", label: "Pro", price: 99.90 },
  { value: "premium", label: "Premium", price: 199.90 },
  { value: "custom", label: "Personalizado", price: 0 },
];

const STATUS_LIST = [
  { value: "trial", label: "Em Teste", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  { value: "active", label: "Ativo", color: "bg-green-500/10 text-green-600 border-green-200" },
  { value: "expired", label: "Vencido", color: "bg-orange-500/10 text-orange-600 border-orange-200" },
  { value: "suspended", label: "Suspenso", color: "bg-red-500/10 text-red-600 border-red-200" },
  { value: "canceled", label: "Cancelado", color: "bg-gray-500/10 text-gray-600 border-gray-200" },
];

export default function AdminSubscriptions() {
  const { user, isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [pizzerias, setPizzerias] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  // Modal states
  const [editingPizzeria, setEditingPizzeria] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const hasAdminAccess = isSuperAdmin || isHardcodedAdmin;

  useEffect(() => {
    if (!loading && !hasAdminAccess) nav({ to: "/dashboard" });
  }, [loading, hasAdminAccess, nav]);

  useEffect(() => { 
    if (hasAdminAccess) loadData(); 
  }, [hasAdminAccess]);

  async function loadData() {
    setIsDataLoading(true);
    try {
      const { data, error } = await supabase
        .from("pizzerias")
        .select(`
          *,
          orders(id, total, created_at)
        `)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPizzerias(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setIsDataLoading(false);
    }
  }

  const filteredPizzerias = useMemo(() => {
    return pizzerias.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.slug.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.subscription_status === statusFilter;
      const matchesPlan = planFilter === "all" || p.subscription_plan === planFilter;
      
      // Special filters for near expiry
      if (statusFilter === "vencendo") {
        if (!p.subscription_expires_at) return false;
        const days = differenceInDays(new Date(p.subscription_expires_at), new Date());
        return days >= 0 && days <= 3;
      }

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [pizzerias, searchTerm, statusFilter, planFilter]);

  const metrics = useMemo(() => {
    const total = pizzerias.length;
    const active = pizzerias.filter(p => p.subscription_status === "active").length;
    const trial = pizzerias.filter(p => p.subscription_status === "trial").length;
    const expired = pizzerias.filter(p => p.subscription_status === "expired").length;
    const suspended = pizzerias.filter(p => p.subscription_status === "suspended").length;
    
    const monthlyRevenue = pizzerias.reduce((acc, p) => {
      if (p.subscription_status === "active" || p.subscription_status === "trial") {
        return acc + Number(p.subscription_price || 0);
      }
      return acc;
    }, 0);

    return { total, active, trial, expired, suspended, monthlyRevenue };
  }, [pizzerias]);

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPizzeria) return;

    try {
      const { error } = await supabase
        .from("pizzerias")
        .update({
          subscription_plan: editingPizzeria.subscription_plan,
          subscription_status: editingPizzeria.subscription_status,
          subscription_expires_at: editingPizzeria.subscription_expires_at,
          subscription_price: editingPizzeria.subscription_price,
          internal_notes: editingPizzeria.internal_notes,
          is_active: editingPizzeria.subscription_status !== "suspended",
        })
        .eq("id", editingPizzeria.id);

      if (error) throw error;
      
      toast.success("Assinatura atualizada com sucesso!");
      setIsEditModalOpen(false);
      loadData();
    } catch (error: any) {
      toast.error("Erro ao atualizar: " + error.message);
    }
  };

  const getExpiryBadge = (date: string | null, status: string) => {
    if (!date) return <Badge variant="outline">Sem data</Badge>;
    if (status === "suspended") return <Badge variant="destructive">Suspenso</Badge>;
    
    const expiryDate = new Date(date);
    const now = new Date();
    const days = differenceInDays(expiryDate, now);

    if (isBefore(expiryDate, now) && !isToday(expiryDate)) {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Vencido</Badge>;
    }
    if (isToday(expiryDate)) {
      return <Badge className="bg-orange-500 hover:bg-orange-600 gap-1"><Clock className="h-3 w-3" /> Vence hoje</Badge>;
    }
    if (days <= 3) {
      return <Badge className="bg-amber-500 hover:bg-amber-600 gap-1">Vence em {days}d</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">{format(expiryDate, "dd/MM/yyyy")}</Badge>;
  };

  if (!hasAdminAccess) return null;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes e Planos</h1>
          <p className="text-muted-foreground">Gerenciamento comercial e controle de assinaturas da Conectfly.</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" className="gap-2">
          {isDataLoading ? "Carregando..." : "Atualizar Dados"}
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Total Clientes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Ativos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-green-600">{metrics.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Em Teste</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-blue-600">{metrics.trial}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Vencidos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-orange-600">{metrics.expired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Suspensos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-600">{metrics.suspended}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Receita Prevista</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-green-700">R$ {metrics.monthlyRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por loja ou slug..." 
              className="pl-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos Status</option>
            <option value="trial">Em Teste</option>
            <option value="active">Ativo</option>
            <option value="vencendo">Vencendo (3 dias)</option>
            <option value="expired">Vencido</option>
            <option value="suspended">Suspenso</option>
          </select>
          <select 
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
          >
            <option value="all">Todos Planos</option>
            {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja / Slug</TableHead>
              <TableHead>Plano / Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Uso (Pedidos)</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isDataLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                  Carregando clientes...
                </TableCell>
              </TableRow>
            ) : filteredPizzerias.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Nenhum cliente encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              filteredPizzerias.map((p) => {
                const totalOrders = p.orders?.length || 0;
                const totalRevenue = p.orders?.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0) || 0;
                const statusInfo = STATUS_LIST.find(s => s.value === p.subscription_status) || STATUS_LIST[0];
                const planInfo = PLANS.find(pl => pl.value === p.subscription_plan) || PLANS[0];

                return (
                  <TableRow key={p.id} className={p.subscription_status === 'suspended' ? 'bg-muted/30 grayscale-[0.5]' : ''}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold">{p.name}</span>
                        <span className="text-xs text-muted-foreground">/{p.slug}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{planInfo.label}</span>
                        <span className="text-xs text-green-600 font-bold">R$ {Number(p.subscription_price || 0).toFixed(2)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getExpiryBadge(p.subscription_expires_at, p.subscription_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs">
                          <Package className="h-3 w-3" /> {totalOrders} ped.
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          R$ {totalRevenue.toFixed(2)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-xs text-muted-foreground truncate" title={p.internal_notes}>
                        {p.internal_notes || "-"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Ações de Gestão</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => {
                            setEditingPizzeria(p);
                            setIsEditModalOpen(true);
                          }}>
                            <CreditCard className="mr-2 h-4 w-4" /> Gerenciar Assinatura
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            window.open(`/dashboard?pizzeriaId=${p.id}`, '_blank');
                          }}>
                            <LayoutDashboard className="mr-2 h-4 w-4" /> Acessar Painel FL
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            window.open(`https://conectfly.com.br/${p.slug}`, '_blank');
                          }}>
                            <Store className="mr-2 h-4 w-4" /> Abrir Cardápio Público
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            navigator.clipboard.writeText(`https://conectfly.com.br/${p.slug}`);
                            toast.success("Link copiado!");
                          }}>
                            <ExternalLink className="mr-2 h-4 w-4" /> Copiar Link Público
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gestão de Assinatura: {editingPizzeria?.name}</DialogTitle>
            <DialogDescription>
              Configure o plano, vencimento e observações internas para este cliente.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleUpdateSubscription} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <select 
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editingPizzeria?.subscription_plan}
                  onChange={e => {
                    const plan = PLANS.find(pl => pl.value === e.target.value);
                    setEditingPizzeria({
                      ...editingPizzeria, 
                      subscription_plan: e.target.value,
                      subscription_price: plan?.price || 0
                    });
                  }}
                >
                  {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={editingPizzeria?.subscription_price || 0}
                  onChange={e => setEditingPizzeria({...editingPizzeria, subscription_price: parseFloat(e.target.value)})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status da Assinatura</Label>
                <select 
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editingPizzeria?.subscription_status}
                  onChange={e => setEditingPizzeria({...editingPizzeria, subscription_status: e.target.value})}
                >
                  {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input 
                  type="date"
                  value={editingPizzeria?.subscription_expires_at ? editingPizzeria.subscription_expires_at.split('T')[0] : ''}
                  onChange={e => setEditingPizzeria({...editingPizzeria, subscription_expires_at: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações Internas (Somente Admin)</Label>
              <Textarea 
                placeholder="Ex: Cliente em teste, negociando pagamento..."
                value={editingPizzeria?.internal_notes || ""}
                onChange={e => setEditingPizzeria({...editingPizzeria, internal_notes: e.target.value})}
                rows={3}
              />
            </div>

            {editingPizzeria?.subscription_status === 'suspended' && (
              <div className="p-3 bg-red-500/10 border border-red-200 rounded-lg flex gap-3 items-center">
                <Ban className="h-5 w-5 text-red-600 shrink-0" />
                <p className="text-xs text-red-700 font-medium">
                  <strong>Atenção:</strong> Ao marcar como Suspenso, o acesso da pizzaria e o cardápio público serão bloqueados.
                </p>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

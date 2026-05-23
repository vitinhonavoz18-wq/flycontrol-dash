import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Package, DollarSign, Calendar, TrendingUp, Trash2, AlertTriangle } from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/admin")({ component: Admin });

function Admin() {
  const { user, isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [pz, setPz] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const hasAdminAccess = isSuperAdmin || isHardcodedAdmin;

  useEffect(() => {
    if (!loading && !hasAdminAccess) nav({ to: "/dashboard" });
  }, [loading, hasAdminAccess, nav]);

  useEffect(() => { if (hasAdminAccess) load(); }, [hasAdminAccess]);
  
  async function load() {
    // 1. Buscamos as pizzarias e seus pedidos (relacionamento que funciona)
    const { data: pizzeriasData, error: pzError } = await supabase
      .from("pizzerias")
      .select(`
        *,
        orders(id, total, created_at)
      `)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    
    if (pzError) {
      toast.error("Erro ao carregar pizzarias: " + pzError.message);
      return;
    }

    // 2. Coletamos todos os owner_ids únicos e válidos
    const ownerIds = (pizzeriasData || [])
      .map(p => p.owner_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    
    const uniqueOwnerIds = Array.from(new Set(ownerIds));

    // 3. Buscamos os perfis separadamente para evitar erro de relacionamento no cache
    const profilesMap: Record<string, any> = {};
    if (uniqueOwnerIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uniqueOwnerIds);
      
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap[profile.id] = profile;
        });
      }
    }

    // 4. Juntamos os dados no frontend
    const joinedData = (pizzeriasData || []).map(pz => ({
      ...pz,
      owner: pz.owner_id ? (profilesMap[pz.owner_id] || null) : null
    }));

    setPz(joinedData);
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("pizzerias").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  async function toggleActive(id: string, current: boolean) {
    const action = current ? "desativar" : "ativar";
    if (!confirm(`Tem certeza que deseja ${action} esta pizzaria?`)) return;

    const { error } = await supabase.from("pizzerias").update({ is_active: !current }).eq("id", id);
    if (error) {
      toast.error("Erro ao alterar status: " + error.message);
    } else {
      toast.success(`Pizzaria ${current ? "desativada" : "ativada"} com sucesso.`);
      load();
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(true);
    const { error } = await supabase.from("pizzerias").update({ status: 'deleted' }).eq("id", id);
    setIsDeleting(false);
    setDeletingId(null);
    
    if (error) {
      toast.error("Não foi possível excluir esta pizzaria. Tente novamente.");
    } else {
      toast.success("Pizzaria excluída com sucesso.");
      load();
    }
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">FLYPIZZARIAS</h1>
        <p className="text-muted-foreground">Gerenciamento global de todas as pizzarias da plataforma.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pz.map((p) => (
          <PizzeriaCard key={p.id} p={p} onStatusChange={setStatus} onToggleActive={toggleActive} onDelete={() => setDeletingId(p.id)} />
        ))}
        {!pz.length && (
          <div className="col-span-full flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
            Nenhuma pizzaria cadastrada até o momento.
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="border-destructive/20 shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-xl">
              Tem certeza que deseja excluir esta pizzaria?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Essa ação pode afetar o acesso da pizzaria, pedidos vinculados e relatórios financeiros.
              <br /><br />
              <span className="font-semibold text-foreground/80">
                Essa pizzaria possui histórico de pedidos. Ela será desativada para preservar os dados antigos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:justify-center">
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                if (deletingId) handleDelete(deletingId);
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir pizzaria"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PizzeriaCard({ p, onStatusChange, onToggleActive, onDelete }: { p: any, onStatusChange: (id: string, s: string) => void, onToggleActive: (id: string, current: boolean) => void, onDelete: () => void }) {
  const orders = p.orders || [];
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter((o: any) => o.created_at.startsWith(today));
  const totalRevenue = orders.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);
  const todayRevenue = todayOrders.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
          <p className="text-xs text-muted-foreground">/{p.slug}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={p.status === 'active' ? 'default' : 'outline'} className={p.status === 'active' ? 'bg-success/20 text-success border-success/40' : ''}>
            {p.status === 'active' ? 'Ativa' : 'Pausada'}
          </Badge>
          <Badge variant={p.is_active !== false ? 'default' : 'destructive'} className={p.is_active !== false ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40' : 'bg-rose-500/20 text-rose-600 border-rose-500/40'}>
            {p.is_active !== false ? 'CONTA ATIVA' : 'CONTA INATIVA'}
          </Badge>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground">Pedidos Hoje</p>
          <div className="flex items-center gap-2">
            <Package className="h-3 w-3 text-primary" />
            <span className="text-sm font-semibold">{todayOrders.length}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground">Receita Hoje</p>
          <div className="flex items-center gap-2">
            <DollarSign className="h-3 w-3 text-success" />
            <span className="text-sm font-semibold">R$ {todayRevenue.toFixed(2)}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground">Total Pedidos</p>
          <span className="text-sm font-semibold">{orders.length}</span>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground">Faturamento Total</p>
          <span className="text-sm font-semibold text-primary">R$ {totalRevenue.toFixed(2)}</span>
        </div>
      </div>

      <div className="mb-4 border-t border-border pt-4">
        <p className="text-[10px] uppercase text-muted-foreground">Dono</p>
        <p className="text-sm font-medium">{p.owner?.full_name || 'Não vinculado'}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
        <select 
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary"
          value={p.status} 
          onChange={(e) => onStatusChange(p.id, e.target.value)}
        >
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
        </select>
        
        <Button
          variant={p.is_active !== false ? "destructive" : "default"}
          size="sm"
          className="h-8 text-xs px-2"
          onClick={() => onToggleActive(p.id, p.is_active !== false)}
        >
          {p.is_active !== false ? "Desativar Conta" : "Ativar Conta"}
        </Button>
        
        <Link 
          to="/dashboard" 
          search={{ pizzeriaId: p.id }}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          Acessar Painel <ExternalLink className="ml-1.5 h-3 w-3" />
        </Link>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={onDelete}
          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
          title="Excluir Pizzaria"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

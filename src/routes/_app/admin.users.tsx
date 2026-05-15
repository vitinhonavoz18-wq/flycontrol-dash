import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/users")({ component: Users });

function Users() {
  const { isSuperAdmin, loading, user: currentUser } = useAuth();
  const nav = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => { if (mounted && !loading && !isSuperAdmin) nav({ to: "/dashboard" }); }, [loading, isSuperAdmin, nav, mounted]);
  useEffect(() => { if (mounted && isSuperAdmin) load(); }, [isSuperAdmin, mounted]);

  async function load() {
    // Buscar emails do auth via função do supabase se possível, ou apenas perfis ativos
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone, created_at")
      .is("deleted_at", null);
    
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    
    // Obter emails (em um sistema real precisaríamos de uma view ou rpc que exponha isso para admins)
    // Para agora, vamos assumir que o listamos o que temos no profile.
    
    const map = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = map.get(r.user_id) ?? []; arr.push(r.role); map.set(r.user_id, arr);
    });
    setList((profiles ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] })));
  }

  async function toggleAdmin(uid: string, has: boolean) {
    if (has) {
      await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "super_admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: uid, role: "super_admin" });
    }
    toast.success("Atualizado"); load();
  }

  async function handleDeleteUser() {
    if (!deletingUser) return;
    
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: deletingUser.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Usuário excluído com sucesso.");
      setDeletingUser(null);
      load();
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      toast.error(error.message || "Não foi possível excluir o usuário.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!mounted || loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="p-6 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Usuários</h1>
      </div>
      
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Telefone</th>
              <th className="p-3 text-left">Papéis</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const isAdmin = u.roles.includes("super_admin");
              const isCurrentUser = currentUser?.id === u.id;
              
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.phone ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r: string) => (
                        <span key={r} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase">
                          {r}
                        </span>
                      )) || "—"}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant={isAdmin ? "outline" : "default"} onClick={() => toggleAdmin(u.id, isAdmin)}>
                        {isAdmin ? "Remover admin" : "Tornar admin"}
                      </Button>
                      
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => setDeletingUser(u)}
                        disabled={isCurrentUser}
                        title={isCurrentUser ? "Você não pode excluir sua própria conta" : "Excluir usuário"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Sem usuários</td></tr>}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este usuário? Ele perderá o acesso ao FlyControl e precisará criar uma nova conta com novo email e nova senha.
              <div className="mt-4 p-3 bg-muted rounded-lg space-y-1 text-foreground">
                <p><strong>Nome:</strong> {deletingUser?.full_name || "—"}</p>
                <p><strong>Papéis:</strong> {deletingUser?.roles?.join(", ") || "Usuário comum"}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleDeleteUser();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Excluindo..." : "Excluir usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

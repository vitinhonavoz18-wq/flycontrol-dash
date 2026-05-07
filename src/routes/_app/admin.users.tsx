import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/users")({ component: Users });

function Users() {
  const { isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<any[]>([]);

  useEffect(() => { if (!loading && !isSuperAdmin) nav({ to: "/dashboard" }); }, [loading, isSuperAdmin, nav]);
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);

  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone, created_at");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
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

  if (!isSuperAdmin) return null;
  return (
    <div className="p-6 md:p-8">
      <h1 className="mb-6 text-3xl font-bold">Usuários</h1>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Telefone</th>
              <th className="p-3 text-left">Papéis</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const isAdmin = u.roles.includes("super_admin");
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.phone ?? "—"}</td>
                  <td className="p-3">{u.roles.join(", ") || "—"}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant={isAdmin ? "outline" : "default"} onClick={() => toggleAdmin(u.id, isAdmin)}>
                      {isAdmin ? "Remover admin" : "Tornar admin"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Sem usuários</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/admin")({ component: Admin });

function Admin() {
  const { isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [pz, setPz] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !isSuperAdmin) nav({ to: "/dashboard" });
  }, [loading, isSuperAdmin, nav]);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);
  async function load() {
    const { data } = await supabase.from("pizzerias").select("*").order("created_at", { ascending: false });
    setPz(data ?? []);
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("pizzerias").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  async function remove(id: string) {
    if (!confirm("Excluir esta pizzaria e todos os pedidos?")) return;
    const { error } = await supabase.from("pizzerias").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="p-6 md:p-8">
      <h1 className="mb-6 text-3xl font-bold">Pizzarias cadastradas</h1>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Slug</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Criada em</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {pz.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.slug}</td>
                <td className="p-3">
                  <select className="rounded bg-background px-2 py-1" value={p.status} onChange={(e) => setStatus(p.id, e.target.value)}>
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </td>
                <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => remove(p.id)}>Excluir</Button>
                </td>
              </tr>
            ))}
            {!pz.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sem pizzarias</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { ComboManager } from "@/components/combos/ComboManager";

export const Route = createFileRoute("/_app/combos")({ component: CombosPage });

function CombosPage() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzerias, setPizzerias] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadPizzerias();
  }, [user]);

  async function loadPizzerias() {
    setLoading(true);
    let query = supabase.from("pizzerias").select("*").neq("status", "deleted").order("name");
    
    if (!isSuperAdmin && user?.id) {
      query = query.eq("owner_id", user.id);
    }
    
    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar pizzarias: " + error.message);
      setLoading(false);
      return;
    }
    
    setPizzerias(data ?? []);
    if (data && data.length) {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get("pizzeriaId");
      if (pId && data.some(p => p.id === pId)) {
        setActiveId(pId);
      } else {
        setActiveId(data[0].id);
      }
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!pizzerias.length) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold">Nenhuma pizzaria encontrada</h1>
        <p className="text-muted-foreground mt-2">Você precisa ter uma pizzaria vinculada para gerenciar os combos.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Combos</h1>
          <p className="text-muted-foreground">Crie e gerencie combos promocionais para atrair mais clientes.</p>
        </div>
        <PizzeriaSelector 
          pizzerias={pizzerias} 
          activeId={activeId} 
          onSelect={setActiveId} 
        />
      </div>

      {activeId && <ComboManager pizzeriaId={activeId} />}
    </div>
  );
}

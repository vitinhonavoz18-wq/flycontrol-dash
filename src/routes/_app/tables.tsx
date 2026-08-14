import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { TablesManagement } from "@/components/TablesManagement";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequireFeature } from "@/components/PremiumFeatureLock";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";

export const Route = createFileRoute("/_app/tables")({ component: TablesPage });

function TablesPage() {
  return (
    <RequireFeature feature="tables">
      <TablesPageInner />
    </RequireFeature>
  );
}

function TablesPageInner() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pizzerias, setPizzerias] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    async function loadPizzerias() {
      if (!user) return;

      try {
        let query = supabase
          .from("pizzerias")
          .select("*")
          .neq("status", "deleted")
          .neq("status", "inactive")
          .order("name");

        if (!isSuperAdmin && user?.id) {
          query = query.eq("owner_id", user.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        const list = data ?? [];
        setPizzerias(list);
        if (list.length) {
          const params = new URLSearchParams(window.location.search);
          const pId = params.get("pizzeriaId");
          setActiveId(pId && list.some((p) => p.id === pId) ? pId : list[0].id);
        }
      } catch (error: any) {
        toast.error("Erro ao carregar dados da loja: " + error.message);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadPizzerias();
    }
  }, [user, isSuperAdmin, authLoading]);

  function handleSelect(id: string) {
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("pizzeriaId", id);
    window.history.replaceState({}, "", url);
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pizzerias.length) {
    return (
      <div className="p-8 text-center">
        <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold">Nenhuma loja encontrada</h2>
        <p className="text-muted-foreground mt-2">Você precisa cadastrar uma loja primeiro.</p>
        <Button asChild className="mt-4">
          <Link to="/settings">Cadastrar loja</Link>
        </Button>
      </div>
    );
  }

  const activePizzeria = pizzerias.find((p) => p.id === activeId) ?? null;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {pizzerias.length > 0 && (
        <div className="mb-6 flex justify-end">
          <div className="w-full sm:w-auto">
            <PizzeriaSelector pizzerias={pizzerias} activeId={activeId} onSelect={handleSelect} />
          </div>
        </div>
      )}
      {activePizzeria && (
        <TablesManagement
          key={activePizzeria.id}
          tenantId={activePizzeria.id}
          restaurantSlug={activePizzeria.slug}
        />
      )}
    </div>
  );
}

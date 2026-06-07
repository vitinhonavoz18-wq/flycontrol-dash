import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { TablesManagement } from "@/components/TablesManagement";
import { Loader2, LayoutGrid, Store } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tables")({ component: TablesPage });

function TablesPage() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pizzeria, setPizzeria] = useState<any>(null);

  useEffect(() => {
    async function loadPizzeria() {
      if (!user) return;
      
      try {
        let query = supabase.from("pizzerias").select("*").neq("status", "deleted");
        
        if (!isSuperAdmin && user?.id) {
          query = query.eq("owner_id", user.id);
        }
        
        const { data, error } = await query.order("created_at").limit(1).maybeSingle();
        
        if (error) throw error;
        setPizzeria(data);
      } catch (error: any) {
        toast.error("Erro ao carregar dados da loja: " + error.message);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadPizzeria();
    }
  }, [user, isSuperAdmin, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pizzeria) {
    return (
      <div className="p-8 text-center">
        <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold">Nenhuma loja encontrada</h2>
        <p className="text-muted-foreground mt-2">Você precisa cadastrar uma loja primeiro.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <TablesManagement tenantId={pizzeria.id} restaurantSlug={pizzeria.slug} />
    </div>
  );
}

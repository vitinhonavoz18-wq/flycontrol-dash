import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { CategoryList } from "./CategoryList";
import { ProductList } from "./ProductList";
import { ExtraList } from "./ExtraList";
import { PizzeriaConfig } from "./PizzeriaConfig";

interface MenuManagerProps {
  pizzeriaId: string;
}

export function MenuManager({ pizzeriaId }: MenuManagerProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pizzeria, setPizzeria] = useState<any>(null);

  useEffect(() => {
    if (pizzeriaId) {
      loadPizzeria();
      loadCategories();
    }
  }, [pizzeriaId]);

  async function loadPizzeria() {
    const { data } = await supabase
      .from("pizzerias")
      .select("id, name, slug, api_key")
      .eq("id", pizzeriaId)
      .single();
    if (data) setPizzeria(data);
  }

  async function loadCategories() {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("pizzeria_id", pizzeriaId)
      .order("order_index");

    if (error) {
      toast.error("Erro ao carregar categorias: " + error.message);
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  }

  async function handleSync() {
    if (!pizzeria?.slug) {
      toast.error("Slug da pizzaria não encontrado.");
      return;
    }

    setSyncing(true);
    const toastId = toast.loading("Buscando cardápio no site...");

    try {
      // 1. Fetch menu from SiteCreatorFly
      const response = await fetch(`https://sitecreatorfly.com/api/pizzerias/${pizzeria.slug}/menu-full`);
      
      if (!response.ok) {
        throw new Error("Não foi possível conectar ao SiteCreatorFly.");
      }

      const externalMenu = await response.json();

      // 2. Send to our local sync endpoint
      const syncResponse = await fetch("/api/pizzerias/sync-menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": pizzeria.api_key
        },
        body: JSON.stringify({
          pizzeria_id: pizzeriaId,
          api_key: pizzeria.api_key,
          menu: externalMenu
        })
      });

      const syncResult = await syncResponse.json();

      if (syncResult.success) {
        const { results } = syncResult;
        toast.success(`Cardápio sincronizado! Encontramos ${results.categories} categorias, ${results.products} produtos, ${results.beverages} bebidas e ${results.extras} bordas/adicionais.`, { id: toastId });
        loadCategories();
      } else {
        toast.error(syncResult.error || "Erro na sincronização.", { id: toastId });
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error("Nenhum cardápio original encontrado para esta pizzaria ou erro de conexão.", { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <TabsList className="grid w-full grid-cols-2 lg:w-[750px] lg:grid-cols-5 bg-muted/50 p-1">
            <TabsTrigger value="categories" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Categorias</TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Produtos</TabsTrigger>
            <TabsTrigger value="beverages" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bebidas</TabsTrigger>
            <TabsTrigger value="extras" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bordas/Adicionais</TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-primary font-semibold">Configurações</TabsTrigger>
          </TabsList>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSync} 
            disabled={syncing}
            className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar cardápio existente
          </Button>
        </div>

        <div className="mt-6">
          <TabsContent value="categories" className="m-0 focus-visible:outline-none">
            <CategoryList pizzeriaId={pizzeriaId} categories={categories} onRefresh={loadCategories} />
          </TabsContent>
          
          <TabsContent value="products" className="m-0 focus-visible:outline-none">
            <ProductList 
              pizzeriaId={pizzeriaId} 
              categories={categories.filter(c => c.active)} 
              type="standard" 
              title="Sabores & Produtos" 
            />
          </TabsContent>

          <TabsContent value="beverages" className="m-0 focus-visible:outline-none">
            <ProductList 
              pizzeriaId={pizzeriaId} 
              categories={categories.filter(c => c.active)} 
              type="beverage" 
              title="Bebidas" 
            />
          </TabsContent>

          <TabsContent value="extras" className="m-0 focus-visible:outline-none">
            <ExtraList pizzeriaId={pizzeriaId} />
          </TabsContent>

          <TabsContent value="config" className="m-0 focus-visible:outline-none">
            <PizzeriaConfig pizzeriaId={pizzeriaId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
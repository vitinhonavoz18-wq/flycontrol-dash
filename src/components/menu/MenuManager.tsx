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
    const toastId = toast.loading("Iniciando sincronização com SiteCreatorFly...");
    
    const slug = pizzeria.slug;
    const endpoint = `https://sitecreatorfly.com/api/menu-sync?slug=${slug}`;
    
    console.log("--- Início da Sincronização ---");
    console.log("Slug enviado:", slug);
    console.log("Endpoint usado:", endpoint);

    try {
      // 1. Fetch menu from SiteCreatorFly
      let response;
      try {
        response = await fetch(endpoint);
      } catch (e) {
        console.error("Erro de conexão:", e);
        throw new Error("endpoint_no_response");
      }
      
      console.log("Status HTTP da resposta:", response.status);
      
      if (response.status === 404) {
        throw new Error("pizzeria_not_found");
      }
      
      if (response.status === 403 || response.status === 401) {
        throw new Error("permission_error");
      }

      if (!response.ok) {
        throw new Error("endpoint_no_response");
      }

      const externalMenu = await response.json();
      console.log("Resposta recebida:", externalMenu);

      if (!externalMenu || (
        (!externalMenu.categories || externalMenu.categories.length === 0) &&
        (!externalMenu.products || externalMenu.products.length === 0) &&
        (!externalMenu.beverages || externalMenu.beverages.length === 0) &&
        (!externalMenu.extras || externalMenu.extras.length === 0)
      )) {
        throw new Error("empty_menu");
      }

      console.log("Pizzeria ID encontrado:", pizzeriaId);
      console.log("Quantidade de categorias recebidas:", externalMenu.categories?.length || 0);
      console.log("Quantidade de produtos recebidos:", externalMenu.products?.length || 0);
      console.log("Quantidade de bebidas recebidas:", externalMenu.beverages?.length || 0);
      console.log("Quantidade de bordas recebidas:", externalMenu.extras?.length || 0);
      console.log("Quantidade de combos recebidos:", externalMenu.combos?.length || 0);

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
        toast.success(`Cardápio sincronizado! Importados: ${results.categories} categorias, ${results.products} produtos, ${results.beverages} bebidas, ${results.extras} bordas e ${results.combos} combos.`, { id: toastId });
        loadCategories();
      } else {
        console.error("Erro no mapeamento:", syncResult.error);
        throw new Error("mapping_error");
      }
    } catch (error: any) {
      console.error("Sync error full:", error);
      
      let message = "Erro inesperado na sincronização.";
      if (error.message === "pizzeria_not_found") {
        message = "Pizzaria não encontrada pelo slug informado.";
      } else if (error.message === "endpoint_no_response") {
        message = "Endpoint de sincronização não respondeu.";
      } else if (error.message === "empty_menu") {
        message = "Cardápio encontrado, mas sem produtos cadastrados.";
      } else if (error.message === "permission_error") {
        message = "Erro de permissão ao acessar cardápio.";
      } else if (error.message === "mapping_error") {
        message = "Erro ao mapear os dados recebidos.";
      }
      
      toast.error(message, { id: toastId });
    } finally {
      console.log("--- Fim da Sincronização ---");
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
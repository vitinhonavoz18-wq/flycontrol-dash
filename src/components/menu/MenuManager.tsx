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
      .select("id, name, slug, api_key, sync_endpoint")
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
    const endpoint = `https://conectfly.lovable.app/api/menu-sync?slug=${slug}`;
    
    console.log("--- Início da Sincronização ---");
    console.log("Pizzaria selecionada:", pizzeria.name);
    console.log("Slug enviado:", slug);
    console.log("URL chamada:", endpoint);
    console.log("Pizzeria ID:", pizzeriaId);
    console.log("API Key presente:", !!pizzeria.api_key);

    try {
      // 1. Fetch menu from SiteCreatorFly with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

      let response;
      try {
        response = await fetch(endpoint, { 
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
      } catch (e: any) {
        console.error("Erro real na chamada HTTP:", e);
        if (e.name === 'AbortError') {
          throw new Error("timeout");
        }
        // No browser, erros de CORS geralmente resultam em TypeError ou Failed to fetch
        // sem detalhes no e.message por segurança.
        throw new Error("cors_error");
      }
      
      console.log("Status HTTP retornado:", response.status);
      
      if (response.status === 404) {
        throw new Error("pizzeria_not_found");
      }
      
      if (response.status === 403 || response.status === 401) {
        throw new Error("permission_error");
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.log("Resposta recebida (não-JSON):", text.substring(0, 500));
        throw new Error("not_json");
      }

      const externalMenu = await response.json();
      console.log("Resposta JSON recebida:", externalMenu);

      if (externalMenu.success === false) {
        const errorMsg = externalMenu.message || externalMenu.error || "Erro retornado pelo endpoint";
        throw new Error(`api_error:${errorMsg}`);
      }

      // Check if we have data to import
      const hasCategories = externalMenu.categories?.length > 0;
      const hasProducts = externalMenu.products?.length > 0;
      const hasBeverages = externalMenu.beverages?.length > 0;
      const hasBorders = externalMenu.borders?.length > 0;
      const hasAdditionals = externalMenu.additionals?.length > 0;
      const hasCombos = externalMenu.combos?.length > 0;

      if (!hasCategories && !hasProducts && !hasBeverages && !hasBorders && !hasAdditionals && !hasCombos) {
        throw new Error("empty_menu");
      }

      console.log("Importando dados para Pizzeria ID:", pizzeriaId);
      
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
          menu: {
            ...externalMenu,
            // Ensure compatibility with internal sync endpoint expectations
            extras: [
              ...(externalMenu.borders || []).map((b: any) => ({ ...b, extra_type: 'borda' })),
              ...(externalMenu.additionals || []).map((a: any) => ({ ...a, extra_type: 'adicional' }))
            ]
          }
        })
      });

      const syncResult = await syncResponse.json();
      console.log("Resultado da sincronização local:", syncResult);

      if (syncResult.success) {
        const { results } = syncResult;
        toast.success(`Cardápio sincronizado! Importados: ${results.categories} categorias, ${results.products} produtos, ${results.beverages} bebidas, ${results.extras} bordas/adicionais e ${results.combos} combos.`, { id: toastId });
        loadCategories();
      } else {
        console.error("Erro no mapeamento local:", syncResult.error);
        throw new Error(`mapping_error:${syncResult.error}`);
      }
    } catch (error: any) {
      console.error("Erro detalhado capturado:", error);
      
      let message = "Erro inesperado na sincronização.";
      const errorMsg = error.message || "";

      if (errorMsg === "pizzeria_not_found") {
        message = "Endpoint de sincronização não encontrado (404).";
      } else if (errorMsg === "cors_error") {
        message = "Erro de CORS ao acessar o SiteCreatorFly. Verifique as permissões do endpoint no SiteCreatorFly.";
      } else if (errorMsg === "timeout") {
        message = "Endpoint demorou para responder (timeout).";
      } else if (errorMsg === "not_json") {
        message = "O endpoint respondeu uma página, mas era esperado JSON.";
      } else if (errorMsg === "empty_menu") {
        message = "Cardápio encontrado, mas está vazio no SiteCreatorFly.";
      } else if (errorMsg === "permission_error") {
        message = "Erro de permissão ao acessar cardápio (401/403).";
      } else if (errorMsg.startsWith("mapping_error:")) {
        message = "Erro ao salvar no FlyControl: " + errorMsg.replace("mapping_error:", "");
      } else if (errorMsg.startsWith("api_error:")) {
        message = errorMsg.replace("api_error:", "");
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
            <CategoryList 
              pizzeriaId={pizzeriaId} 
              categories={categories} 
              onRefresh={loadCategories} 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
            />
          </TabsContent>
          
          <TabsContent value="products" className="m-0 focus-visible:outline-none">
            <ProductList 
              pizzeriaId={pizzeriaId} 
              categories={categories.filter(c => c.active)} 
              type="standard" 
              title="Sabores & Produtos" 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
            />
          </TabsContent>

          <TabsContent value="beverages" className="m-0 focus-visible:outline-none">
            <ProductList 
              pizzeriaId={pizzeriaId} 
              categories={categories.filter(c => c.active)} 
              type="beverage" 
              title="Bebidas" 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
            />
          </TabsContent>

          <TabsContent value="extras" className="m-0 focus-visible:outline-none">
            <ExtraList 
              pizzeriaId={pizzeriaId} 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
            />
          </TabsContent>

          <TabsContent value="config" className="m-0 focus-visible:outline-none">
            <PizzeriaConfig pizzeriaId={pizzeriaId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
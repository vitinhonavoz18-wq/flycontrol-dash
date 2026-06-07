import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { CategoryList } from "./CategoryList";
import { ProductList } from "./ProductList";
import { ExtraList } from "./ExtraList";
import { PizzaSizeList } from "./PizzaSizeList";
import { PizzeriaConfig } from "./PizzeriaConfig";
import { MenuSyncSection } from "./MenuSyncSection";

interface MenuManagerProps {
  pizzeriaId: string;
}

const DEFAULT_SYNC_ENDPOINT = "https://watjejwgtieqfkpebkfz.supabase.co/functions/v1/menu-sync";

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

  async function handleLocalRefresh() {
    loadCategories();
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
      <MenuSyncSection 
        pizzeriaId={pizzeriaId} 
        onSyncSuccess={loadCategories}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <TabsList className="grid w-full grid-cols-2 lg:w-[900px] lg:grid-cols-6 bg-muted/50 p-1">
            <TabsTrigger value="categories" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Categorias</TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Sabores</TabsTrigger>
            <TabsTrigger value="pizza_sizes" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Tamanhos</TabsTrigger>
            <TabsTrigger value="beverages" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bebidas</TabsTrigger>
            <TabsTrigger value="extras" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bordas/Adic.</TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-primary font-semibold">Config.</TabsTrigger>
          </TabsList>

        </div>

        <div className="mt-6">
          <TabsContent value="categories" className="m-0 focus-visible:outline-none">
            <CategoryList 
              pizzeriaId={pizzeriaId} 
              categories={categories} 
              onRefresh={handleSync} 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
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
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleSync}
            />
          </TabsContent>

          <TabsContent value="pizza_sizes" className="m-0 focus-visible:outline-none">
            <PizzaSizeList 
              pizzeriaId={pizzeriaId} 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleSync}
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
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleSync}
            />
          </TabsContent>

          <TabsContent value="extras" className="m-0 focus-visible:outline-none">
            <ExtraList 
              pizzeriaId={pizzeriaId} 
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleSync}
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
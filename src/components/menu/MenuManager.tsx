import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
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

  useEffect(() => {
    if (pizzeriaId) {
      loadCategories();
    }
  }, [pizzeriaId]);

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
        <TabsList className="grid w-full grid-cols-2 lg:w-[750px] lg:grid-cols-5 bg-muted/50 p-1">
          <TabsTrigger value="categories" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Categorias</TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Produtos</TabsTrigger>
          <TabsTrigger value="beverages" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bebidas</TabsTrigger>
          <TabsTrigger value="extras" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Bordas/Adicionais</TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-primary font-semibold">Configurações</TabsTrigger>
        </TabsList>

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

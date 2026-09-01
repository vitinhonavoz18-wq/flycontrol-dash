import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabs, type ScrollableTabItem } from "@/components/layout/ScrollableTabs";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { CategoryList } from "./CategoryList";
import { ProductList } from "./ProductList";
import { ExtraList } from "./ExtraList";
import { PizzaSizeList } from "./PizzaSizeList";
import { PizzeriaConfig } from "./PizzeriaConfig";
import { MenuSyncSection } from "./MenuSyncSection";
import { MenuTemplatePicker } from "./MenuTemplatePicker";
import { MenuImportDialog } from "./MenuImportDialog";
import { vocabularioDaLoja } from "@/lib/menu/vocabulario";

interface MenuManagerProps {
  pizzeriaId: string;
}

const DEFAULT_SYNC_ENDPOINT = "https://watjejwgtieqfkpebkfz.supabase.co/functions/v1/menu-sync";

/**
 * Abas do cardápio, em um só lugar — a ordem aqui é a ordem na tela.
 *
 * Os nomes vêm do vocabulário do nicho: uma farmácia não vê "Sabores" nem
 * "Bordas". Os IDENTIFICADORES (`products`, `extras`, …) nunca mudam — é por
 * eles que a tela sabe qual lista abrir, então trocar a placa não troca a
 * prateleira.
 */
function abasDoCardapio(v: ReturnType<typeof vocabularioDaLoja>): readonly ScrollableTabItem[] {
  return [
    { value: "categories", label: "Categorias" },
    { value: "products", label: v.abaProdutos },
    { value: "pizza_sizes", label: v.abaTamanhos },
    { value: "beverages", label: "Bebidas" },
    { value: "extras", label: v.abaExtras },
    { value: "config", label: "Config.", emphasis: true },
  ];
}

export function MenuManager({ pizzeriaId }: MenuManagerProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pizzeria, setPizzeria] = useState<any>(null);
  // As listas de cada aba carregam os próprios dados ao montar. Depois de uma
  // importação em massa, trocar esta chave é o que faz todas recarregarem —
  // sem isso o cardápio novo só apareceria ao sair e voltar da tela.
  const [refreshKey, setRefreshKey] = useState(0);
  // "Outro" no seletor de modelo não cria nada — só dispensa a tela para a
  // loja aparecer vazia, do jeito que já era antes de existir este seletor.
  const [templateSkipped, setTemplateSkipped] = useState(false);

  useEffect(() => {
    if (pizzeriaId) {
      loadPizzeria();
      loadCategories();
    }
  }, [pizzeriaId]);

  async function loadPizzeria() {
    const { data } = await supabase
      .from("pizzerias")
      // `business_type` e `site_settings` entram para a tela saber falar a
      // língua do nicho — farmácia não tem sabor nem borda.
      .select("id, name, slug, api_key, sync_endpoint, business_type, site_settings")
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

  if (categories.length === 0 && !templateSkipped) {
    return (
      <MenuTemplatePicker
        pizzeriaId={pizzeriaId}
        onApplied={loadCategories}
        onSkip={() => setTemplateSkipped(true)}
      />
    );
  }

  const vocabulario = vocabularioDaLoja(pizzeria);

  return (
    <div className="space-y-4">
      <MenuSyncSection pizzeriaId={pizzeriaId} onSyncSuccess={loadCategories} />

      <div className="flex justify-end">
        <MenuImportDialog
          pizzeriaId={pizzeriaId}
          pizzeriaSlug={pizzeria?.slug}
          pizzeriaApiKey={pizzeria?.api_key}
          syncEndpoint={pizzeria?.sync_endpoint}
          existingCategoryCount={categories.length}
          onImported={() => {
            loadCategories();
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <ScrollableTabs items={abasDoCardapio(vocabulario)} value={activeTab} className="mb-2" />

        <div className="mt-6">
          <TabsContent value="categories" className="m-0 focus-visible:outline-none">
            <CategoryList
              vocabulario={vocabulario}
              pizzeriaId={pizzeriaId}
              categories={categories}
              onRefresh={handleLocalRefresh}
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
            />
          </TabsContent>

          <TabsContent value="products" className="m-0 focus-visible:outline-none">
            <ProductList
              vocabulario={vocabulario}
              key={`products-${refreshKey}`}
              pizzeriaId={pizzeriaId}
              categories={categories.filter((c) => c.active)}
              type="standard"
              title={vocabulario.tituloProdutos}
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleLocalRefresh}
            />
          </TabsContent>

          <TabsContent value="pizza_sizes" className="m-0 focus-visible:outline-none">
            <PizzaSizeList
              vocabulario={vocabulario}
              pizzeriaId={pizzeriaId}
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleLocalRefresh}
            />
          </TabsContent>

          <TabsContent value="beverages" className="m-0 focus-visible:outline-none">
            <ProductList
              vocabulario={vocabulario}
              key={`beverages-${refreshKey}`}
              pizzeriaId={pizzeriaId}
              categories={categories.filter((c) => c.active)}
              type="beverage"
              title="Bebidas"
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleLocalRefresh}
            />
          </TabsContent>

          <TabsContent value="extras" className="m-0 focus-visible:outline-none">
            <ExtraList
              vocabulario={vocabulario}
              key={`extras-${refreshKey}`}
              pizzeriaId={pizzeriaId}
              pizzeriaSlug={pizzeria?.slug}
              pizzeriaApiKey={pizzeria?.api_key}
              syncEndpoint={pizzeria?.sync_endpoint}
              onRefresh={handleLocalRefresh}
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

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Loader2, Ruler } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface PizzaSizeListProps {
  pizzeriaId: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  onRefresh?: () => void;
}

export function PizzaSizeList({ pizzeriaId, pizzeriaSlug, pizzeriaApiKey, syncEndpoint, onRefresh }: PizzaSizeListProps) {
  const [sizes, setSizes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSize, setEditingSize] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [maxFlavors, setMaxFlavors] = useState("1");
  const [slices, setSlices] = useState("8");
  const [sortOrder, setSortOrder] = useState("0");

  useEffect(() => {
    loadSizes();
  }, [pizzeriaId]);

  async function loadSizes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pizzeria_pizza_sizes")
      .select("*")
      .eq("pizzeria_id", pizzeriaId)
      .order("sort_order", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar tamanhos: " + error.message);
    } else {
      setSizes(data || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingSize(null);
    setName("");
    setPrice("");
    setMaxFlavors("1");
    setSlices("8");
    setSortOrder(sizes.length.toString());
    setIsDialogOpen(true);
  }

  function openEdit(size: any) {
    setEditingSize(size);
    setName(size.name);
    setPrice(size.price.toString());
    setMaxFlavors(size.max_flavors.toString());
    setSlices((size.slices || 8).toString());
    setSortOrder((size.sort_order || 0).toString());
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!name || !price) {
      toast.error("Nome e preço são obrigatórios");
      return;
    }

    setSaving(true);
    const numericPrice = parseFloat(price.replace(',', '.'));
    const payload = {
      name,
      price: numericPrice,
      max_flavors: parseInt(maxFlavors),
      slices: parseInt(slices),
      sort_order: parseInt(sortOrder),
      pizzeria_id: pizzeriaId,
      active: editingSize ? editingSize.active : true,
    };

    try {
      let externalId = editingSize?.external_id;

      if (pizzeriaSlug && pizzeriaApiKey) {
        const syncResult = await syncToExternal({
          type: 'pizza_size',
          action: editingSize ? 'update' : 'create',
          id: editingSize?.id,
          externalId: editingSize?.external_id,
          data: payload,
          pizzeriaSlug,
          pizzeriaApiKey,
          syncEndpoint
        });

        if (!syncResult.success) {
          let errorMsg = "Não foi possível atualizar o cardápio público. Verifique a conexão com o SiteCreatorFly.";
          
          if (syncResult.error === "404") {
            errorMsg = "Endpoint de sincronização não encontrado (404).";
          } else if (syncResult.error === "auth_error") {
            errorMsg = "Chave de autorização inválida ou sem permissão (401/403).";
          } else if (syncResult.error === "cors_error") {
            errorMsg = "Erro de CORS ao atualizar o SiteCreatorFly.";
          } else if (syncResult.error === "html_response") {
            errorMsg = "Endpoint retornou HTML, mas era esperado JSON.";
          } else if (syncResult.error?.startsWith("api_error:")) {
            errorMsg = syncResult.error.replace("api_error:", "");
          }
          
          toast.error(errorMsg);
          setSaving(false);
          return;
        } else {
          externalId = syncResult.externalId;
        }
      }

      const finalPayload = { 
        ...payload, 
        external_id: externalId, 
        updated_at: new Date().toISOString()
      };

      let error;
      if (editingSize) {
        const { error: err } = await supabase
          .from("pizzeria_pizza_sizes")
          .update(finalPayload)
          .eq("id", editingSize.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("pizzeria_pizza_sizes")
          .insert(finalPayload);
        error = err;
      }

      if (error) {
        toast.error("Erro ao salvar tamanho: " + error.message);
      } else {
        toast.success("Cardápio atualizado no site com sucesso.");
        setIsDialogOpen(false);
        if (onRefresh) onRefresh();
        else loadSizes();
      }
    } catch (e: any) {
      toast.error("Erro inesperado: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(size: any) {
    const newValue = !size.active;
    
    if (pizzeriaSlug && pizzeriaApiKey && size.external_id) {
      const syncResult = await syncToExternal({
        type: 'pizza_size',
        action: 'status',
        externalId: size.external_id,
        data: { field: 'is_active', value: newValue },
        pizzeriaSlug,
        pizzeriaApiKey,
        syncEndpoint
      });

      if (!syncResult.success) {
        let errorMsg = "Não foi possível atualizar o cardápio público. Verifique a conexão com o SiteCreatorFly.";
        if (syncResult.error?.startsWith("api_error:")) {
          errorMsg = syncResult.error.replace("api_error:", "");
        }
        toast.error(errorMsg);
        return;
      }
    }

    const { error } = await supabase
      .from("pizzeria_pizza_sizes")
      .update({ active: newValue, updated_at: new Date().toISOString() })
      .eq("id", size.id);
    
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadSizes();
    }
  }

  async function handleDelete(size: any) {
    if (!confirm("Tem certeza que deseja excluir este tamanho? Isso pode afetar os cálculos de preço no site.")) return;

    if (pizzeriaSlug && pizzeriaApiKey && size.external_id) {
      const syncResult = await syncToExternal({
        type: 'pizza_size',
        action: 'delete',
        externalId: size.external_id,
        pizzeriaSlug,
        pizzeriaApiKey,
        syncEndpoint
      });

      if (!syncResult.success) {
        let errorMsg = "Não foi possível atualizar o cardápio público.";
        toast.error(errorMsg);
        return;
      }
    }

    const { error } = await supabase
      .from("pizzeria_pizza_sizes")
      .delete()
      .eq("id", size.id);
    
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadSizes();
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" /> Tamanhos & Preços de Pizza
        </h3>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Tamanho
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sizes.map((size) => (
          <Card key={size.id} className={`transition-all hover:border-primary/30 ${!size.active ? 'opacity-60 bg-muted/30' : ''}`}>
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg">{size.name}</h4>
                  <p className="text-xs text-muted-foreground">{size.slices} fatias • Até {size.max_flavors} {size.max_flavors === 1 ? 'sabor' : 'sabores'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-xl text-primary">R$ {size.price.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Preço Base</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{size.active ? 'Ativo' : 'Inativo'}</span>
                  <Switch 
                    checked={size.active} 
                    onCheckedChange={() => toggleActive(size)}
                    className="h-4 w-7"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(size)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(size)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!sizes.length && (
          <div className="col-span-full text-center py-12 border border-dashed rounded-lg text-muted-foreground">
            Nenhum tamanho configurado.
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSize ? "Editar Tamanho" : "Novo Tamanho"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="size-name">Nome do Tamanho</Label>
              <Input id="size-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pequena, Média, Grande, Família" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="size-price">Preço Base (R$)</Label>
                <Input id="size-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="size-flavors">Máx. de Sabores</Label>
                <Input id="size-flavors" type="number" value={maxFlavors} onChange={(e) => setMaxFlavors(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="size-slices">Qtd. de Fatias</Label>
                <Input id="size-slices" type="number" value={slices} onChange={(e) => setSlices(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="size-order">Ordem de Exibição</Label>
                <Input id="size-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

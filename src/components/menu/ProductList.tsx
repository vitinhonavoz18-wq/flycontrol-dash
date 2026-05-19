import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Image as ImageIcon, Loader2 } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductListProps {
  pizzeriaId: string;
  categories: any[];
  type: string;
  title: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  onRefresh?: () => void;
}

export function ProductList({ pizzeriaId, categories, type, title, pizzeriaSlug, pizzeriaApiKey, syncEndpoint, onRefresh }: ProductListProps) {

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productType, setProductType] = useState(type);

  useEffect(() => {
    loadProducts();
  }, [pizzeriaId, type]);

  async function loadProducts() {
    setLoading(true);
    let query = supabase
      .from("menu_products")
      .select("*, menu_categories(name)")
      .eq("pizzeria_id", pizzeriaId);

    if (type === "beverage") {
      query = query.eq("product_type", "beverage");
    } else {
      query = query.neq("product_type", "beverage");
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar produtos: " + error.message);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingProduct(null);
    setName("");
    setDescription("");
    setPrice("");
    setCategoryId(categories.length > 0 ? categories[0].id : "");
    setImageUrl("");
    setProductType(type === "beverage" ? "beverage" : "standard");
    setIsDialogOpen(true);
  }

  function openEdit(prod: any) {
    setEditingProduct(prod);
    setName(prod.name);
    setDescription(prod.description || "");
    setPrice(prod.price.toString());
    setCategoryId(prod.category_id || "");
    setImageUrl(prod.image_url || "");
    setProductType(prod.product_type);
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
      description,
      price: numericPrice,
      category_id: productType === 'beverage' ? null : (categoryId || null),
      image_url: imageUrl,
      product_type: productType,
      pizzeria_id: pizzeriaId,
      active: editingProduct ? editingProduct.active : true,
      available: editingProduct ? editingProduct.available : true,
    };

    try {
      let externalId = editingProduct?.external_id;

      if (pizzeriaSlug && pizzeriaApiKey) {
        // Find external category ID
        const cat = categories.find(c => c.id === categoryId);
        const external_category_id = cat?.external_id;

        const syncResult = await syncToExternal({
          type: productType,
          action: editingProduct ? 'update' : 'create',
          id: editingProduct?.id,
          externalId: editingProduct?.external_id,
          data: { ...payload, external_category_id },
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
        external_source: externalId ? 'sitecreatorfly' : null,
        updated_at: new Date().toISOString()
      };

      let error;
      if (editingProduct) {
        const { error: err } = await supabase
          .from("menu_products")
          .update(finalPayload)
          .eq("id", editingProduct.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("menu_products")
          .insert(finalPayload);
        error = err;
      }

      if (error) {
        toast.error("Erro ao salvar produto: " + error.message);
      } else {
        toast.success("Cardápio atualizado no site com sucesso.");
        setIsDialogOpen(false);
        if (onRefresh) onRefresh();
        else loadProducts();
      }
    } catch (e: any) {
      toast.error("Erro inesperado: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(prod: any, field: 'active' | 'available') {
    const newValue = !prod[field];
    
    if (pizzeriaSlug && pizzeriaApiKey && prod.external_id) {
      // Standardize to 'active' as requested, using 'is_active' for the external field reference if needed
      // but syncToExternal already maps body.active = data.value for status action
      const syncResult = await syncToExternal({
        type: prod.product_type,
        action: 'status',
        externalId: prod.external_id,
        data: { value: newValue },
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
        return;
      }
    }

    const updateData: any = {};
    updateData[field] = newValue;
    
    const { error } = await supabase
      .from("menu_products")
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq("id", prod.id);
    
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadProducts();
    }
  }

  async function handleDelete(prod: any) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    if (pizzeriaSlug && pizzeriaApiKey && prod.external_id) {
      const syncResult = await syncToExternal({
        type: prod.product_type,
        action: 'delete',
        externalId: prod.external_id,
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
        return;
      }
    }

    const { error } = await supabase
      .from("menu_products")
      .delete()
      .eq("id", prod.id);
    
    if (error) {
      toast.error("Erro ao excluir produto: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadProducts();
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
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Item
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((prod) => (
          <Card key={prod.id} className={`overflow-hidden transition-all hover:border-primary/30 ${!prod.active ? 'opacity-60 bg-muted/30' : ''}`}>
            {prod.image_url ? (
              <div className="h-40 w-full overflow-hidden bg-muted">
                <img src={prod.image_url} alt={prod.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-40 w-full bg-muted flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h4 className="font-bold line-clamp-1">{prod.name}</h4>
                  <p className="text-xs text-muted-foreground">{prod.menu_categories?.name || 'Sem categoria'}</p>
                </div>
                <p className="font-bold text-primary">R$ {prod.price.toFixed(2)}</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md text-[10px] font-medium">
                  <span className={prod.available ? 'text-success' : 'text-destructive'}>
                    {prod.available ? 'Disponível' : 'Indisponível'}
                  </span>
                  <Switch 
                    checked={prod.available} 
                    onCheckedChange={() => toggleStatus(prod, 'available')}
                    className="h-4 w-7 data-[state=checked]:bg-success"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md text-[10px] font-medium ml-auto">
                  <span>Ativo</span>
                  <Switch 
                    checked={prod.active} 
                    onCheckedChange={() => toggleStatus(prod, 'active')}
                    className="h-4 w-7"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(prod)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(prod)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!products.length && (
          <div className="col-span-full text-center py-12 border border-dashed rounded-lg text-muted-foreground">
            Nenhum produto encontrado.
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Item" : "Novo Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="prod-name">Nome</Label>
                <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Margherita, Coca-Cola 350ml" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-price">Preço (R$)</Label>
                <Input id="prod-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
              </div>
              {productType !== 'beverage' && (
                <div className="space-y-2">
                  <Label htmlFor="prod-cat">Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="prod-cat">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-type">Tipo</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger id="prod-type">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Padrão / Produto</SelectItem>
                  <SelectItem value="flavor">Sabor</SelectItem>
                  <SelectItem value="beverage">Bebida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {productType !== 'beverage' && (
              <div className="space-y-2">
                <Label htmlFor="prod-desc">Descrição</Label>
                <Input id="prod-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ingredientes, detalhes..." />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prod-img">URL da Imagem</Label>
              <div className="flex gap-2">
                <Input id="prod-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                {imageUrl && (
                  <div className="h-10 w-10 shrink-0 rounded border overflow-hidden">
                    <img src={imageUrl} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
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

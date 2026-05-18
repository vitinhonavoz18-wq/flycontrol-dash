import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Image as ImageIcon, Loader2, Filter } from "lucide-react";
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
}

export function ProductList({ pizzeriaId, categories, type, title }: ProductListProps) {
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
    const payload = {
      name,
      description,
      price: parseFloat(price.replace(',', '.')),
      category_id: categoryId || null,
      image_url: imageUrl,
      product_type: productType,
      pizzeria_id: pizzeriaId,
    };

    let error;
    if (editingProduct) {
      const { error: err } = await supabase
        .from("menu_products")
        .update(payload)
        .eq("id", editingProduct.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from("menu_products")
        .insert(payload);
      error = err;
    }

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar produto: " + error.message);
    } else {
      toast.success(`Produto ${editingProduct ? "atualizado" : "criado"} com sucesso!`);
      setIsDialogOpen(false);
      loadProducts();
    }
  }

  async function toggleStatus(prod: any, field: 'active' | 'available') {
    const { error } = await supabase
      .from("menu_products")
      .update({ [field]: !prod[field] })
      .eq("id", prod.id);
    
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      loadProducts();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    const { error } = await supabase
      .from("menu_products")
      .delete()
      .eq("id", id);
    
    if (error) {
      toast.error("Erro ao excluir produto: " + error.message);
    } else {
      toast.success("Produto excluído com sucesso!");
      loadProducts();
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
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(prod.id)}>
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

            <div className="space-y-2">
              <Label htmlFor="prod-desc">Descrição</Label>
              <Input id="prod-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ingredientes, detalhes..." />
            </div>

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

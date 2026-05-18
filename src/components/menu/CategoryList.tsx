import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, GripVertical, Loader2 } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CategoryListProps {
  pizzeriaId: string;
  categories: any[];
  onRefresh: () => void;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
}

export function CategoryList({ pizzeriaId, categories, onRefresh, pizzeriaSlug, pizzeriaApiKey }: CategoryListProps) {

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  function openCreate() {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setIsDialogOpen(true);
  }

  function openEdit(cat: any) {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!name) {
      toast.error("Nome da categoria é obrigatório");
      return;
    }

    setLoading(true);
    const payload = {
      name,
      description,
      pizzeria_id: pizzeriaId,
      order_index: editingCategory ? editingCategory.order_index : categories.length,
    };

    try {
      let externalId = editingCategory?.external_id;

      // Sync to external if we have credentials
      if (pizzeriaSlug && pizzeriaApiKey) {
        const syncResult = await syncToExternal({
          type: 'category',
          action: editingCategory ? 'update' : 'create',
          id: editingCategory?.id,
          externalId: editingCategory?.external_id,
          data: payload,
          pizzeriaSlug,
          pizzeriaApiKey
        });

        if (!syncResult.success) {
          toast.warning(`Salvo localmente, mas houve um erro ao sincronizar com o site: ${syncResult.error}`);
        } else {
          externalId = syncResult.externalId;
        }
      }

      const finalPayload = { ...payload, external_id: externalId, external_source: externalId ? 'sitecreatorfly' : null };

      let error;
      if (editingCategory) {
        const { error: err } = await supabase
          .from("menu_categories")
          .update(finalPayload)
          .eq("id", editingCategory.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("menu_categories")
          .insert(finalPayload);
        error = err;
      }

      if (error) {
        toast.error("Erro ao salvar categoria: " + error.message);
      } else {
        toast.success(`Categoria ${editingCategory ? "atualizada" : "criada"} com sucesso!`);
        setIsDialogOpen(false);
        onRefresh();
      }
    } catch (e: any) {
      toast.error("Erro inesperado: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(cat: any) {
    if (pizzeriaSlug && pizzeriaApiKey && cat.external_id) {
      await syncToExternal({
        type: 'category',
        action: 'patch',
        externalId: cat.external_id,
        data: { field: 'is_active', value: !cat.active },
        pizzeriaSlug,
        pizzeriaApiKey
      });
    }

    const { error } = await supabase
      .from("menu_categories")
      .update({ active: !cat.active })
      .eq("id", cat.id);
    
    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
    } else {
      onRefresh();
    }
  }

  async function handleDelete(cat: any) {
    if (!confirm("Tem certeza que deseja excluir esta categoria? Isso pode afetar os produtos vinculados.")) return;

    if (pizzeriaSlug && pizzeriaApiKey && cat.external_id) {
      await syncToExternal({
        type: 'category',
        action: 'delete',
        externalId: cat.external_id,
        pizzeriaSlug,
        pizzeriaApiKey
      });
    }

    const { error } = await supabase
      .from("menu_categories")
      .delete()
      .eq("id", cat.id);
    
    if (error) {
      toast.error("Erro ao excluir categoria: " + error.message);
    } else {
      toast.success("Categoria excluída com sucesso!");
      onRefresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Categorias</h3>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      <div className="grid gap-3">
        {categories.map((cat) => (
          <Card key={cat.id} className={`transition-all hover:border-primary/30 ${!cat.active ? 'opacity-60 bg-muted/30' : ''}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                <div>
                  <h4 className="font-bold">{cat.name}</h4>
                  {cat.description && <p className="text-sm text-muted-foreground">{cat.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 mr-4">
                  <span className="text-xs text-muted-foreground">{cat.active ? 'Ativa' : 'Inativa'}</span>
                  <Switch 
                    checked={cat.active} 
                    onCheckedChange={() => toggleActive(cat)} 
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(cat)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!categories.length && (
          <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
            Nenhuma categoria criada ainda.
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Ex: Pizzas Tradicionais, Bebidas, etc." 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input 
                id="description" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="Ex: Todas as pizzas acompanham molho de tomate." 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

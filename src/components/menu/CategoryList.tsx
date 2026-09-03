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
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ImageUpload } from "@/components/ui/image-upload";
import type { VocabularioDoCardapio } from "@/lib/menu/vocabulario";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { mensagemDoErro } from "@/lib/errors";
import type { MenuCategory } from "@/types/menu";

interface CategoryListProps {
  pizzeriaId: string;
  categories: MenuCategory[];
  onRefresh: () => void;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  vocabulario: VocabularioDoCardapio;
}

export function CategoryList({
  pizzeriaId,
  categories,
  onRefresh,
  pizzeriaSlug,
  pizzeriaApiKey,
  syncEndpoint,
  vocabulario,
}: CategoryListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openCreate() {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setImageUrl(null);
    setIsDialogOpen(true);
  }

  function openEdit(cat: MenuCategory) {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setImageUrl(cat.image_url || null);
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
      image_url: imageUrl,
      pizzeria_id: pizzeriaId,
      order_index: editingCategory ? editingCategory.order_index : categories.length,
      active: editingCategory ? editingCategory.active : true,
    };

    try {
      let externalId = editingCategory?.external_id;

      // Sync to external if we have credentials
      if (pizzeriaSlug && pizzeriaApiKey) {
        const syncResult = await syncToExternal({
          type: "category",
          action: editingCategory ? "update" : "create",
          id: editingCategory?.id,
          externalId: editingCategory?.external_id ?? undefined,
          data: payload,
          pizzeriaSlug,
          pizzeriaApiKey,
          syncEndpoint,
        });

        if (!syncResult.success) {
          let errorMsg =
            "Não foi possível atualizar o cardápio público. Verifique a conexão com o site público.";

          if (syncResult.error === "404") {
            errorMsg = "Endpoint de sincronização não encontrado (404).";
          } else if (syncResult.error === "auth_error") {
            errorMsg = "Chave de autorização inválida ou sem permissão (401/403).";
          } else if (syncResult.error === "cors_error") {
            errorMsg = "Erro de conexão ao atualizar o site público.";
          } else if (syncResult.error === "html_response") {
            errorMsg = "Endpoint retornou HTML, mas era esperado JSON.";
          } else if (syncResult.error?.startsWith("api_error:")) {
            errorMsg = syncResult.error.replace("api_error:", "");
          }

          toast.error(errorMsg);
          setLoading(false);
          return;
        } else {
          externalId = syncResult.externalId;
        }
      }

      const finalPayload = {
        ...payload,
        external_id: externalId,
        external_source: externalId ? "sitecreatorfly" : null,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (editingCategory) {
        const { error: err } = await supabase
          .from("menu_categories")
          .update(finalPayload)
          .eq("id", editingCategory.id);
        error = err;
      } else {
        const { error: err } = await supabase.from("menu_categories").insert(finalPayload);
        error = err;
      }

      if (error) {
        toast.error("Erro ao salvar categoria: " + error.message);
      } else {
        toast.success("Cardápio atualizado no site com sucesso.");
        setIsDialogOpen(false);
        onRefresh();
      }
    } catch (e) {
      toast.error("Erro inesperado: " + mensagemDoErro(e));
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(cat: MenuCategory) {
    if (pizzeriaSlug && pizzeriaApiKey && cat.external_id) {
      const syncResult = await syncToExternal({
        type: "category",
        action: "status",
        externalId: cat.external_id,
        data: { field: "is_active", value: !cat.active },
        pizzeriaSlug,
        pizzeriaApiKey,
        syncEndpoint,
      });

      if (!syncResult.success) {
        let errorMsg =
          "Não foi possível atualizar o cardápio público. Verifique a conexão com o site público.";

        if (syncResult.error === "404") {
          errorMsg = "Endpoint de sincronização não encontrado (404).";
        } else if (syncResult.error === "auth_error") {
          errorMsg = "Chave de autorização inválida ou sem permissão (401/403).";
        } else if (syncResult.error === "cors_error") {
          errorMsg = "Erro de conexão ao atualizar o site público.";
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
      .from("menu_categories")
      .update({ active: !cat.active, updated_at: new Date().toISOString() })
      .eq("id", cat.id);

    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      onRefresh();
    }
  }

  async function handleDelete(cat: MenuCategory) {
    if (
      !confirm(
        "Tem certeza que deseja excluir esta categoria? Isso pode afetar os produtos vinculados.",
      )
    )
      return;

    if (pizzeriaSlug && pizzeriaApiKey && cat.external_id) {
      const syncResult = await syncToExternal({
        type: "category",
        action: "delete",
        externalId: cat.external_id,
        pizzeriaSlug,
        pizzeriaApiKey,
        syncEndpoint,
      });

      if (!syncResult.success) {
        let errorMsg =
          "Não foi possível atualizar o cardápio público. Verifique a conexão com o site público.";

        if (syncResult.error === "404") {
          errorMsg = "Endpoint de sincronização não encontrado (404).";
        } else if (syncResult.error === "auth_error") {
          errorMsg = "Chave de autorização inválida ou sem permissão (401/403).";
        } else if (syncResult.error === "cors_error") {
          errorMsg = "Erro de conexão ao atualizar o site público.";
        } else if (syncResult.error === "html_response") {
          errorMsg = "Endpoint retornou HTML, mas era esperado JSON.";
        } else if (syncResult.error?.startsWith("api_error:")) {
          errorMsg = syncResult.error.replace("api_error:", "");
        }

        toast.error(errorMsg);
        return;
      }
    }

    const { error } = await supabase.from("menu_categories").delete().eq("id", cat.id);

    if (error) {
      toast.error("Erro ao excluir categoria: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      onRefresh();
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Categorias"
        action={
          <Button onClick={openCreate} className="h-11 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova Categoria
          </Button>
        }
      />

      <div className="grid gap-3">
        {categories.map((cat) => (
          <Card
            key={cat.id}
            className={`transition-colors hover:border-primary/30 ${!cat.active ? "opacity-60 bg-muted/30" : ""}`}
          >
            {/* Duas faixas empilhadas no celular (identificação em cima, ações
                embaixo) e uma linha só a partir de sm. O `min-w-0` em cascata
                é o que faz o nome truncar em vez de empurrar as ações para
                fora do card. */}
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <GripVertical
                  className="h-5 w-5 shrink-0 cursor-move text-muted-foreground"
                  aria-hidden="true"
                />
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <h4 className="truncate font-bold">{cat.name}</h4>
                  {cat.description && (
                    <p className="truncate text-sm text-muted-foreground">{cat.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {cat.active ? "Ativa" : "Inativa"}
                  </span>
                  <Switch
                    checked={cat.active ?? false}
                    onCheckedChange={() => toggleActive(cat)}
                    aria-label={`${cat.active ? "Desativar" : "Ativar"} a categoria ${cat.name}`}
                  />
                </div>
                {/* h-11 w-11 = 44px de área de toque, com o ícone menor dentro. */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => openEdit(cat)}
                    aria-label={`Editar a categoria ${cat.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-destructive"
                    onClick={() => handleDelete(cat)}
                    aria-label={`Excluir a categoria ${cat.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
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
                placeholder={vocabulario.exemploNomeCategoria}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={vocabulario.exemploDescricaoCategoria}
              />
            </div>
            {/* A foto da categoria só aparece para o cliente quando o cardápio
                está em "Cards de Categoria" ou "Navegação por Categorias"
                (Minha Loja → Comportamento). Sem foto, o cartão sai com um
                fundo neutro — nada quebra. */}
            <div className="space-y-2">
              <Label>Foto da categoria (opcional)</Label>
              <ImageUpload value={imageUrl} onChange={setImageUrl} folder="categories" />
              <p className="text-xs text-muted-foreground">
                Aparece no cartão desta categoria no cardápio do cliente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

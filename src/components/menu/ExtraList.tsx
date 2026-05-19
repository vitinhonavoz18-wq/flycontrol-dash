import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
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

interface ExtraListProps {
  pizzeriaId: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  onRefresh?: () => void;
}

export function ExtraList({ pizzeriaId, pizzeriaSlug, pizzeriaApiKey, syncEndpoint, onRefresh }: ExtraListProps) {

  const [extras, setExtras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [extraType, setExtraType] = useState("borda");

  useEffect(() => {
    loadExtras();
  }, [pizzeriaId]);

  async function loadExtras() {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_extras")
      .select("*")
      .eq("pizzeria_id", pizzeriaId)
      .order("extra_type", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar complementos: " + error.message);
    } else {
      setExtras(data || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingExtra(null);
    setName("");
    setPrice("");
    setExtraType("borda");
    setIsDialogOpen(true);
  }

  function openEdit(ext: any) {
    setEditingExtra(ext);
    setName(ext.name);
    setPrice(ext.price.toString());
    setExtraType(ext.extra_type);
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
      extra_type: extraType,
      pizzeria_id: pizzeriaId,
      active: editingExtra ? editingExtra.active : true,
    };

    try {
      let externalId = editingExtra?.external_id;

      if (pizzeriaSlug && pizzeriaApiKey) {
        const syncResult = await syncToExternal({
          type: 'extra',
          action: editingExtra ? 'update' : 'create',
          id: editingExtra?.id,
          externalId: editingExtra?.external_id,
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
        external_source: externalId ? 'sitecreatorfly' : null,
        updated_at: new Date().toISOString()
      };

      let error;
      if (editingExtra) {
        const { error: err } = await supabase
          .from("menu_extras")
          .update(finalPayload)
          .eq("id", editingExtra.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("menu_extras")
          .insert(finalPayload);
        error = err;
      }

      if (error) {
        toast.error("Erro ao salvar complemento: " + error.message);
      } else {
        toast.success("Cardápio atualizado no site com sucesso.");
        setIsDialogOpen(false);
        if (onRefresh) onRefresh();
        else loadExtras();
      }
    } catch (e: any) {
      toast.error("Erro inesperado: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ext: any) {
    const newValue = !ext.active;
    
    if (pizzeriaSlug && pizzeriaApiKey && ext.external_id) {
      const syncResult = await syncToExternal({
        type: 'extra',
        action: 'status',
        externalId: ext.external_id,
        data: { field: 'is_active', value: newValue },
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
      .from("menu_extras")
      .update({ active: newValue, updated_at: new Date().toISOString() })
      .eq("id", ext.id);
    
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadExtras();
    }
  }

  async function handleDelete(ext: any) {
    if (!confirm("Tem certeza que deseja excluir este complemento?")) return;

    if (pizzeriaSlug && pizzeriaApiKey && ext.external_id) {
      const syncResult = await syncToExternal({
        type: 'extra',
        action: 'delete',
        externalId: ext.external_id,
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
      .from("menu_extras")
      .delete()
      .eq("id", ext.id);
    
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      if (onRefresh) onRefresh();
      else loadExtras();
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const bordas = extras.filter(e => e.extra_type === 'borda');
  const adicionais = extras.filter(e => e.extra_type === 'adicional');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Bordas & Adicionais</h3>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Complemento
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h4 className="font-bold flex items-center gap-2 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Bordas Recheadas
          </h4>
          <div className="space-y-3">
            {bordas.map((ext) => (
              <ExtraItem key={ext.id} ext={ext} onEdit={openEdit} onToggle={toggleActive} onDelete={handleDelete} />
            ))}
            {!bordas.length && <EmptyList />}
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="font-bold flex items-center gap-2 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Adicionais
          </h4>
          <div className="space-y-3">
            {adicionais.map((ext) => (
              <ExtraItem key={ext.id} ext={ext} onEdit={openEdit} onToggle={toggleActive} onDelete={handleDelete} />
            ))}
            {!adicionais.length && <EmptyList />}
          </div>
        </section>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExtra ? "Editar Complemento" : "Novo Complemento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ext-type">Tipo</Label>
              <Select value={extraType} onValueChange={setExtraType}>
                <SelectTrigger id="ext-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borda">Borda Recheada</SelectItem>
                  <SelectItem value="adicional">Adicional / Topping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-name">Nome</Label>
              <Input id="ext-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Catupiry, Bacon, Cheddar..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-price">Preço adicional (R$)</Label>
              <Input id="ext-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
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

function ExtraItem({ ext, onEdit, onToggle, onDelete }: any) {
  return (
    <Card className={`transition-all hover:border-primary/30 ${!ext.active ? 'opacity-60 bg-muted/30' : ''}`}>
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <h5 className="font-semibold text-sm">{ext.name}</h5>
          <p className="text-xs text-primary font-bold">+ R$ {ext.price.toFixed(2)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch 
            checked={ext.active} 
            onCheckedChange={() => onToggle(ext)}
            className="h-4 w-7"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ext)}>
                  <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(ext)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyList() {
  return (
    <div className="text-center py-6 border border-dashed rounded-lg text-xs text-muted-foreground">
      Nenhum item cadastrado.
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Image as ImageIcon, Loader2, Star, Clock, Calendar } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface ComboManagerProps {
  pizzeriaId: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
}

const DAYS = [
  { id: "seg", label: "Seg" },
  { id: "ter", label: "Ter" },
  { id: "qua", label: "Qua" },
  { id: "qui", label: "Qui" },
  { id: "sex", label: "Sex" },
  { id: "sab", label: "Sáb" },
  { id: "dom", label: "Dom" },
];

export function ComboManager({ pizzeriaId, pizzeriaSlug, pizzeriaApiKey, syncEndpoint }: ComboManagerProps) {
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [comboPrice, setComboPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [items, setItems] = useState<{ product_name: string; quantity: number; product_type: string }[]>([]);

  useEffect(() => {
    loadCombos();
  }, [pizzeriaId]);

  async function loadCombos() {
    setLoading(true);
    const { data, error } = await supabase
      .from("combos")
      .select("*, combo_items(*)")
      .eq("pizzeria_id", pizzeriaId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar combos: " + error.message);
    } else {
      setCombos(data || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingCombo(null);
    setName("");
    setDescription("");
    setOriginalPrice("");
    setComboPrice("");
    setImageUrl("");
    setActive(true);
    setHighlight(false);
    setAvailableDays(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]);
    setStartTime("00:00");
    setEndTime("23:59");
    setItems([{ product_name: "", quantity: 1, product_type: "pizza" }]);
    setIsDialogOpen(true);
  }

  async function openEdit(combo: any) {
    setEditingCombo(combo);
    setName(combo.name);
    setDescription(combo.description || "");
    setOriginalPrice(combo.original_price.toString());
    setComboPrice(combo.combo_price.toString());
    setImageUrl(combo.image_url || "");
    setActive(combo.active);
    setHighlight(combo.highlight);
    setAvailableDays(combo.available_days || []);
    setStartTime(combo.start_time || "00:00");
    setEndTime(combo.end_time || "23:59");
    setItems(combo.combo_items || []);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!name || !comboPrice) {
      toast.error("Nome e preço do combo são obrigatórios");
      return;
    }

    setSaving(true);
    const comboPayload: any = {
      pizzeria_id: pizzeriaId,
      name,
      description,
      original_price: parseFloat(originalPrice.replace(',', '.') || "0"),
      combo_price: parseFloat(comboPrice.replace(',', '.')),
      image_url: imageUrl,
      active,
      highlight,
      available_days: availableDays,
      start_time: startTime || null,
      end_time: endTime || null,
    };

    try {
      let externalId = editingCombo?.external_id;

      if (pizzeriaSlug && pizzeriaApiKey) {
        const syncResult = await syncToExternal({
          type: 'combo',
          action: editingCombo ? 'update' : 'create',
          id: editingCombo?.id,
          externalId: editingCombo?.external_id,
          data: { 
            ...comboPayload, 
            items: items.filter(it => it.product_name.trim() !== "") 
          },
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

      const finalComboPayload = {
        ...comboPayload,
        external_id: externalId,
        external_source: externalId ? 'sitecreatorfly' : null,
        updated_at: new Date().toISOString()
      };

      let comboId = editingCombo?.id;
      let error;

      if (editingCombo) {
        const { error: err } = await supabase
          .from("combos")
          .update(finalComboPayload)
          .eq("id", editingCombo.id);
        error = err;
      } else {
        const { data, error: err } = await supabase
          .from("combos")
          .insert(finalComboPayload)
          .select()
          .single();
        error = err;
        if (data) comboId = data.id;
      }

      if (!error && comboId) {
        // Manage items (simple approach: delete and re-insert for now)
        if (editingCombo) {
          await supabase.from("combo_items").delete().eq("combo_id", comboId);
        }
        
        const itemsPayload = items
          .filter(it => it.product_name.trim() !== "")
          .map(it => ({
            combo_id: comboId,
            product_name: it.product_name,
            quantity: it.quantity,
            product_type: it.product_type
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsError } = await supabase.from("combo_items").insert(itemsPayload);
          if (itemsError) error = itemsError;
        }
      }

      if (error) {
        toast.error("Erro ao salvar combo: " + error.message);
      } else {
        toast.success(`Cardápio atualizado no site com sucesso.`);
        setIsDialogOpen(false);
        loadCombos();
      }
    } catch (e: any) {
      toast.error("Erro inesperado: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleField(combo: any, field: string) {
    const newValue = !combo[field];

    if (pizzeriaSlug && pizzeriaApiKey && combo.external_id) {
      // If the field is 'active', we sync it. SiteCreatorFly standard is 'active'.
      if (field === 'active') {
        const syncResult = await syncToExternal({
          type: 'combo',
          action: 'status',
          externalId: combo.external_id,
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
    }

    const updateData: any = {};
    updateData[field] = newValue;
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from("combos")
      .update(updateData)
      .eq("id", combo.id);
    
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      loadCombos();
    }
  }

  async function handleDelete(combo: any) {
    if (!confirm("Tem certeza que deseja excluir este combo?")) return;

    if (pizzeriaSlug && pizzeriaApiKey && combo.external_id) {
      const syncResult = await syncToExternal({
        type: 'combo',
        action: 'delete',
        externalId: combo.external_id,
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
      .from("combos")
      .delete()
      .eq("id", combo.id);
    
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Cardápio atualizado no site com sucesso.");
      loadCombos();
    }
  }

  const addItem = () => setItems([...items, { product_name: "", quantity: 1, product_type: "pizza" }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const toggleDay = (dayId: string) => {
    setAvailableDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Combos Ativos</h3>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Combo
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {combos.map((combo) => (
          <Card key={combo.id} className={`overflow-hidden transition-all hover:border-primary/40 hover:shadow-md ${!combo.active ? 'opacity-60 grayscale-[0.5]' : ''}`}>
            <div className="relative h-48 w-full bg-muted">
              {combo.image_url ? (
                <img src={combo.image_url} alt={combo.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
                  <ImageIcon className="h-12 w-12" />
                </div>
              )}
              {combo.highlight && (
                <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                  <Star className="h-3 w-3 fill-yellow-900" /> DESTAQUE
                </div>
              )}
            </div>
            <CardContent className="p-5 space-y-4">
              <div>
                <h4 className="text-lg font-bold">{combo.name}</h4>
                <p className="text-sm text-muted-foreground line-clamp-2">{combo.description}</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  {combo.original_price > 0 && (
                    <p className="text-xs text-muted-foreground line-through">R$ {combo.original_price.toFixed(2)}</p>
                  )}
                  <p className="text-xl font-black text-primary">R$ {combo.combo_price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">Ativo</span>
                  <Switch checked={combo.active} onCheckedChange={() => toggleField(combo, 'active')} />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-bold uppercase text-muted-foreground">Itens inclusos:</p>
                <ul className="text-xs space-y-1">
                  {combo.combo_items?.map((it: any, idx: number) => (
                    <li key={idx} className="flex justify-between text-foreground/80">
                      <span>{it.quantity}x {it.product_name}</span>
                      <span className="text-[10px] px-1 bg-muted rounded capitalize">{it.product_type}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {combo.start_time?.substring(0, 5)} - {combo.end_time?.substring(0, 5)}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(combo)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(combo.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!combos.length && (
          <div className="col-span-full text-center py-20 border border-dashed rounded-xl bg-muted/20">
            <Plus className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <h4 className="text-lg font-medium text-muted-foreground">Nenhum combo cadastrado</h4>
            <p className="text-sm text-muted-foreground mt-1">Clique no botão acima para criar seu primeiro combo promocional.</p>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCombo ? "Editar Combo" : "Criar Novo Combo"}</DialogTitle>
          </DialogHeader>
          
          <div className="grid md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="combo-name">Nome do Combo</Label>
                <Input id="combo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Combo Família" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="combo-desc">Descrição / Chamada</Label>
                <Input id="combo-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: 2 Pizzas G + Coca 2L" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orig-price">Preço Original (R$)</Label>
                  <Input id="orig-price" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="combo-price">Preço Combo (R$)</Label>
                  <Input id="combo-price" value={comboPrice} onChange={(e) => setComboPrice(e.target.value)} placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="combo-img">URL da Imagem</Label>
                <Input id="combo-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="active" checked={active} onCheckedChange={(v) => setActive(v as boolean)} />
                  <Label htmlFor="active" className="text-sm cursor-pointer">Ativo</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="highlight" checked={highlight} onCheckedChange={(v) => setHighlight(v as boolean)} />
                  <Label htmlFor="highlight" className="text-sm cursor-pointer text-yellow-600 font-bold">Destacar no Site</Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Dias Disponíveis
                </Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {DAYS.map((day) => (
                    <Button
                      key={day.id}
                      type="button"
                      variant={availableDays.includes(day.id) ? "default" : "outline"}
                      className="h-8 w-10 p-0 text-[10px]"
                      onClick={() => toggleDay(day.id)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Início</Label>
                  <Input type="time" id="start-time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">Fim</Label>
                  <Input type="time" id="end-time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <Label>Itens Inclusos</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs text-primary">
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input 
                        placeholder="Nome do item (ex: Pizza Grande)" 
                        className="h-8 text-xs"
                        value={item.product_name}
                        onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                      />
                      <Input 
                        type="number" 
                        className="h-8 w-16 text-xs"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value))}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar Combo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

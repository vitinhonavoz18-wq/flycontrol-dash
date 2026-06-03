import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Store, 
  Settings, 
  CreditCard, 
  Share2, 
  Save, 
  Loader2, 
  Instagram, 
  Phone, 
  MapPin, 
  Clock, 
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Package
} from "lucide-react";
import { PizzeriaPromotion } from "@/components/pizzerias/PizzeriaPromotion";

export default function MyStore() {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pizzeria, setPizzeria] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from("pizzerias").select("*").neq("status", "deleted");
      
      if (!isSuperAdmin && user?.id) {
        query = query.eq("owner_id", user.id);
      }
      
      const { data: pizzeriasData, error: pError } = await query.order("created_at").limit(1).maybeSingle();
      
      if (pError) throw pError;
      
      if (pizzeriasData) {
        setPizzeria(pizzeriasData);
        
        // Load menu data
        const [prodRes, catRes] = await Promise.all([
          supabase.from("menu_products").select("*").eq("pizzeria_id", pizzeriasData.id).order("name"),
          supabase.from("menu_categories").select("*").eq("pizzeria_id", pizzeriasData.id).order("order_index")
        ]);
        
        setProducts(prodRes.data || []);
        setCategories(catRes.data || []);
      }
    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pizzeria) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("pizzerias")
        .update({
          name: pizzeria.name,
          logo_url: pizzeria.logo_url,
          primary_color: pizzeria.primary_color,
          phone: pizzeria.phone,
          instagram_url: pizzeria.instagram_url,
          address: pizzeria.address,
          neighborhood: pizzeria.neighborhood,
          opening_hours: pizzeria.opening_hours,
          status: pizzeria.status,
          delivery_fee: pizzeria.delivery_fee,
          average_delivery_time: pizzeria.average_delivery_time,
          payment_methods: pizzeria.payment_methods,
          short_message: pizzeria.short_message,
        })
        .eq("id", pizzeria.id);

      if (error) throw error;
      toast.success("Alterações salvas com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProduct = async (productId: string, patch: any) => {
    try {
      const { error } = await supabase
        .from("menu_products")
        .update(patch)
        .eq("id", productId);
        
      if (error) throw error;
      
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, ...patch } : p));
      toast.success("Produto atualizado");
    } catch (error: any) {
      toast.error("Erro ao atualizar produto: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pizzeria) {
    return (
      <div className="p-8 text-center">
        <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold">Nenhuma loja encontrada</h2>
        <p className="text-muted-foreground mt-2">Você precisa vincular uma pizzaria nas Configurações primeiro.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Minha Loja</h1>
          <p className="text-muted-foreground">Gerencie os dados operacionais e cardápio do seu delivery.</p>
        </div>
        <Button onClick={handleSaveStore} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Alterações
        </Button>
      </div>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-8">
          <TabsTrigger value="identity" className="gap-2">
            <Store className="h-4 w-4" /> Identidade
          </TabsTrigger>
          <TabsTrigger value="service" className="gap-2">
            <Clock className="h-4 w-4" /> Atendimento
          </TabsTrigger>
          <TabsTrigger value="delivery" className="gap-2">
            <CreditCard className="h-4 w-4" /> Entrega e Pagamento
          </TabsTrigger>
          <TabsTrigger value="menu" className="gap-2">
            <Package className="h-4 w-4" /> Cardápio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidade da Loja</CardTitle>
              <CardDescription>Dados visuais e de marca do seu delivery.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="store-name">Nome Comercial</Label>
                  <Input 
                    id="store-name" 
                    value={pizzeria.name || ""} 
                    onChange={e => setPizzeria({...pizzeria, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram (URL)</Label>
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="instagram" 
                      placeholder="https://instagram.com/sualoja"
                      value={pizzeria.instagram_url || ""} 
                      onChange={e => setPizzeria({...pizzeria, instagram_url: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="logo-url">URL da Logo</Label>
                  <Input 
                    id="logo-url" 
                    placeholder="https://exemplo.com/logo.png"
                    value={pizzeria.logo_url || ""} 
                    onChange={e => setPizzeria({...pizzeria, logo_url: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary-color">Cor Principal (Hex)</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="primary-color" 
                      type="color"
                      className="w-12 p-1 h-9"
                      value={pizzeria.primary_color || "#FF7A00"} 
                      onChange={e => setPizzeria({...pizzeria, primary_color: e.target.value})} 
                    />
                    <Input 
                      value={pizzeria.primary_color || "#FF7A00"} 
                      onChange={e => setPizzeria({...pizzeria, primary_color: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="short-message">Mensagem Curta (Aparece no topo do cardápio)</Label>
                <Input 
                  id="short-message" 
                  placeholder="Ex: A melhor pizza da região!"
                  value={pizzeria.short_message || ""} 
                  onChange={e => setPizzeria({...pizzeria, short_message: e.target.value})} 
                />
              </div>
            </CardContent>
          </Card>

          <PizzeriaPromotion pizzeria={pizzeria} />
        </TabsContent>

        <TabsContent value="service" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados de Atendimento</CardTitle>
              <CardDescription>Como os clientes entram em contato e onde você atende.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp (com DDD)</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="whatsapp" 
                      value={pizzeria.phone || ""} 
                      onChange={e => setPizzeria({...pizzeria, phone: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status Atual da Loja</Label>
                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={pizzeria.status === "active"} 
                        onCheckedChange={checked => setPizzeria({...pizzeria, status: checked ? "active" : "paused"})}
                      />
                      <Label>{pizzeria.status === "active" ? "Aberto" : "Fechado"}</Label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço Completo</Label>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="address" 
                      value={pizzeria.address || ""} 
                      onChange={e => setPizzeria({...pizzeria, address: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro/Região Base</Label>
                  <Input 
                    id="neighborhood" 
                    value={pizzeria.neighborhood || ""} 
                    onChange={e => setPizzeria({...pizzeria, neighborhood: e.target.value})} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-hours">Horário de Funcionamento (Texto livre ou JSON)</Label>
                <Textarea 
                  id="opening-hours" 
                  rows={4}
                  value={typeof pizzeria.opening_hours === 'string' ? pizzeria.opening_hours : JSON.stringify(pizzeria.opening_hours, null, 2)} 
                  onChange={e => setPizzeria({...pizzeria, opening_hours: e.target.value})} 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logística e Pagamento</CardTitle>
              <CardDescription>Taxas, prazos e como você recebe dos clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="delivery-fee">Taxa de Entrega Padrão (R$)</Label>
                  <Input 
                    id="delivery-fee" 
                    type="number" 
                    step="0.01"
                    value={pizzeria.delivery_fee || 0} 
                    onChange={e => setPizzeria({...pizzeria, delivery_fee: parseFloat(e.target.value) || 0})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-time">Tempo Médio de Entrega</Label>
                  <Input 
                    id="delivery-time" 
                    placeholder="Ex: 40-50 min"
                    value={pizzeria.average_delivery_time || ""} 
                    onChange={e => setPizzeria({...pizzeria, average_delivery_time: e.target.value})} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Formas de Pagamento Aceitas</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Vale Refeição'].map(method => {
                    const methods = Array.isArray(pizzeria.payment_methods) ? pizzeria.payment_methods : [];
                    const isChecked = methods.includes(method);
                    return (
                      <div key={method} className="flex items-center space-x-2 border rounded-md p-2">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={e => {
                            const newMethods = e.target.checked 
                              ? [...methods, method]
                              : methods.filter((m: string) => m !== method);
                            setPizzeria({...pizzeria, payment_methods: newMethods});
                          }}
                        />
                        <Label className="text-sm cursor-pointer">{method}</Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="menu" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Edição do Cardápio</CardTitle>
              <CardDescription>Edite preços e visibilidade dos seus produtos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {categories.map(category => (
                  <div key={category.id} className="space-y-4">
                    <h3 className="font-bold text-lg border-b pb-1 text-primary">{category.name}</h3>
                    <div className="grid gap-4">
                      {products.filter(p => p.category_id === category.id).map(product => (
                        <div key={product.id} className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg bg-card/50">
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name} className="w-20 h-20 object-cover rounded-md" />
                          )}
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold">{product.name}</h4>
                              <div className="flex items-center gap-2">
                                <Switch 
                                  checked={product.active} 
                                  onCheckedChange={checked => handleUpdateProduct(product.id, { active: checked })}
                                />
                                <span className="text-xs">{product.active ? "Ativo" : "Inativo"}</span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                            <div className="flex items-center gap-4 pt-2">
                              <div className="w-32">
                                <Label className="text-[10px] uppercase text-muted-foreground">Preço (R$)</Label>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  className="h-8 text-sm"
                                  defaultValue={product.price}
                                  onBlur={e => {
                                    const val = parseFloat(e.target.value);
                                    if (val !== product.price) handleUpdateProduct(product.id, { price: val });
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

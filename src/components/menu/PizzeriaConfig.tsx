import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Clock,
  Truck,
  FileText,
  Globe,
  Key,
  Image as ImageIcon,
  Store,
  Phone,
  ShoppingBag,
  Palette,
  LayoutGrid,
} from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";
import { ImageUpload } from "@/components/ui/image-upload";
import { VideoUpload } from "@/components/ui/video-upload";

interface PizzeriaConfigProps {
  pizzeriaId: string;
}

// Mesma lista usada no formulário equivalente do SiteCreatorFly — mantém os
// dois lados com as mesmas opções.
const BUSINESS_TYPES = [
  "Pizzaria",
  "Pastelaria",
  "Hamburgueria",
  "Restaurante",
  "Lanchonete",
  "Açaíteria",
  "Farmácia",
  "Mercado",
  "Outro",
];

// Os 5 modelos visuais que o SiteCreatorFly já sabe renderizar
// (TemplateRenderer.tsx). O id é o que vai salvo em `selected_template`.
const TEMPLATES = [
  { id: "black", name: "Black Premium", desc: "Escuro, elegante e gastronômico." },
  { id: "white", name: "White Clean", desc: "Versão clara, leve e moderna." },
  { id: "pizza_hut_style", name: "Pizza Red", desc: "Estilo fast-food, visual vermelho." },
  { id: "burger_style", name: "Burger Showcase", desc: "Moderno, foco em hamburguerias." },
  { id: "bar_prime", name: "Bar Prime", desc: "Visual moderno para bares, drinks e eventos." },
];

// Campos desta tela que `prepareDataForExternal('restaurant', ...)` (em
// utils/menuSync.ts) sabe traduzir para o SiteCreatorFly. Campos fora deste
// conjunto (taxa de entrega, slug, chave de API) são só do FlyControl e não
// têm correspondente no site público.
const RESTAURANT_SYNC_FIELDS = new Set([
  "description",
  "opening_hours",
  "hero_image_url",
  "hero_media_type",
  "hero_video_url",
  "business_type",
  "tagline",
  "city",
  "address",
  "phone",
  "whatsapp_display",
  "logo_url",
  "delivery_enabled",
  "pickup_enabled",
  "table_enabled",
  "primary_color",
  "secondary_color",
  "selected_template",
  "show_item_images",
  "site_settings",
]);

function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PizzeriaConfig({ pizzeriaId }: PizzeriaConfigProps) {
  const [pizzeria, setPizzeria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPizzeria();
  }, [pizzeriaId]);

  async function loadPizzeria() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pizzerias")
      .select("*")
      .eq("id", pizzeriaId)
      .single();

    if (error) {
      toast.error("Erro ao carregar dados: " + error.message);
    } else {
      setPizzeria(data);
    }
    setLoading(false);
  }

  async function handleUpdate(field: string, value: any) {
    setSaving(true);
    const { error } = await supabase
      .from("pizzerias")
      .update({ [field]: value } as any)
      .eq("id", pizzeriaId);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }

    // Alguns destes campos aparecem no site público (ex.: "Descrição do
    // Site", "Horário de Funcionamento" no rodapé) — sem isto, a mudança
    // ficava só no FlyControl e nunca chegava ao SiteCreatorFly.
    if (RESTAURANT_SYNC_FIELDS.has(field) && pizzeria?.slug && pizzeria?.api_key) {
      const syncResult = await syncToExternal({
        type: "restaurant",
        action: "update",
        id: pizzeriaId,
        pizzeriaSlug: pizzeria.slug,
        pizzeriaApiKey: pizzeria.api_key,
        syncEndpoint: pizzeria.sync_endpoint,
        data: { [field]: value },
      });

      if (!syncResult.success) {
        toast.error(
          "Salvo no FlyControl, mas não foi possível atualizar o site público. Tente novamente em instantes.",
        );
        setSaving(false);
        loadPizzeria();
        return;
      }
    }

    toast.success("Configuração atualizada");
    loadPizzeria();
    setSaving(false);
  }

  // `site_settings` é uma coluna única no banco (um "pacotinho" de várias
  // configurações juntas) — por isso, ao mudar uma só, primeiro juntamos
  // ela com o que já estava salvo nas outras, para não apagar as demais.
  function handleSiteSettingUpdate(key: string, value: any) {
    const merged = { ...(pizzeria?.site_settings || {}), [key]: value };
    handleUpdate("site_settings", merged);
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Taxas de Entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-fee">Taxa de Entrega Padrão (R$)</Label>
            <Input
              id="delivery-fee"
              type="number"
              step="0.01"
              defaultValue={pizzeria?.delivery_fee || 0}
              onBlur={(e) => handleUpdate("delivery_fee", parseFloat(e.target.value) || 0)}
              placeholder="0,00"
            />
            <p className="text-[10px] text-muted-foreground">
              Valor cobrado por padrão em cada pedido.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Horários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hours">Horário de Funcionamento</Label>
            <Input
              id="hours"
              placeholder="Ex: Seg a Sex: 18h às 23h"
              defaultValue={
                typeof pizzeria?.opening_hours === "string"
                  ? pizzeria?.opening_hours
                  : JSON.stringify(pizzeria?.opening_hours)
              }
              onBlur={(e) => {
                let val = e.target.value;
                try {
                  if (val.startsWith("[") || val.startsWith("{")) {
                    handleUpdate("opening_hours", JSON.parse(val));
                  } else {
                    handleUpdate("opening_hours", val);
                  }
                } catch {
                  handleUpdate("opening_hours", val);
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground">Exibido no rodapé do seu site.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Informações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição do Site</Label>
            <textarea
              id="description"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Fale um pouco sobre a qualidade e tradição da sua pizzaria..."
              defaultValue={pizzeria?.description || ""}
              onBlur={(e) => handleUpdate("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Identidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-type">Tipo de Negócio</Label>
            <select
              id="business-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={pizzeria?.business_type || "Pizzaria"}
              onChange={(e) => handleUpdate("business_type", e.target.value)}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Slogan curto</Label>
            <Input
              id="tagline"
              placeholder="Ex: A melhor pizza da região"
              defaultValue={pizzeria?.tagline || ""}
              onBlur={(e) => handleUpdate("tagline", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              placeholder="Ex: Salvador, BA"
              defaultValue={pizzeria?.city || ""}
              onBlur={(e) => handleUpdate("city", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <ImageUpload
              value={pizzeria?.logo_url}
              onChange={(url) => handleUpdate("logo_url", url)}
              folder="logo"
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> WhatsApp & Endereço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp de Pedidos (com DDD)</Label>
            <Input
              id="phone"
              placeholder="5571986182819"
              inputMode="numeric"
              defaultValue={pizzeria?.phone || ""}
              onBlur={(e) => handleUpdate("phone", e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-[10px] text-muted-foreground">
              Só números, com código do país. Ex: 5571986182819.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp-display">WhatsApp exibido no rodapé</Label>
            <Input
              id="whatsapp-display"
              placeholder="(71) 98618-2819"
              defaultValue={pizzeria?.whatsapp_display || ""}
              onBlur={(e) => handleUpdate("whatsapp_display", formatPhoneMask(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              placeholder="Rua, número, bairro"
              defaultValue={pizzeria?.address || ""}
              onBlur={(e) => handleUpdate("address", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" /> Modos de Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[10px] text-muted-foreground">
            Como o cliente pode comprar no site público.
          </p>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Delivery</p>
              <p className="text-[10px] text-muted-foreground">Entrega</p>
            </div>
            <Switch
              checked={pizzeria?.delivery_enabled ?? true}
              onCheckedChange={(checked) => handleUpdate("delivery_enabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Retirada</p>
              <p className="text-[10px] text-muted-foreground">Cliente busca no local</p>
            </div>
            <Switch
              checked={pizzeria?.pickup_enabled ?? false}
              onCheckedChange={(checked) => handleUpdate("pickup_enabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Consumo Local</p>
              <p className="text-[10px] text-muted-foreground">Mesa / Comanda</p>
            </div>
            <Switch
              checked={pizzeria?.table_enabled ?? false}
              onCheckedChange={(checked) => handleUpdate("table_enabled", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Aparência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Modelo Visual do Site</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleUpdate("selected_template", t.id)}
                  disabled={saving}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    (pizzeria?.selected_template || "black") === t.id
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Cor Primária (HSL)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="primary-color"
                  placeholder='Ex: "0 84% 55%"'
                  defaultValue={pizzeria?.primary_color || ""}
                  onBlur={(e) => handleUpdate("primary_color", e.target.value)}
                  className="flex-1"
                />
                <span
                  className="h-9 w-9 shrink-0 rounded-md border"
                  style={{
                    background: pizzeria?.primary_color
                      ? `hsl(${pizzeria.primary_color})`
                      : undefined,
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Cor Secundária (HSL)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="secondary-color"
                  placeholder='Ex: "45 93% 58%"'
                  defaultValue={pizzeria?.secondary_color || ""}
                  onBlur={(e) => handleUpdate("secondary_color", e.target.value)}
                  className="flex-1"
                />
                <span
                  className="h-9 w-9 shrink-0 rounded-md border"
                  style={{
                    background: pizzeria?.secondary_color
                      ? `hsl(${pizzeria.secondary_color})`
                      : undefined,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Exibir fotos nos sabores/itens</p>
              <p className="text-[10px] text-muted-foreground">
                Habilita o anexo de fotos no cardápio público
              </p>
            </div>
            <Switch
              checked={pizzeria?.show_item_images ?? true}
              onCheckedChange={(checked) => handleUpdate("show_item_images", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" /> Comportamento do Cardápio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry-mode">Modo de Navegação</Label>
              <select
                id="entry-mode"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={pizzeria?.site_settings?.entry_mode || "navigation"}
                onChange={(e) => handleSiteSettingUpdate("entry_mode", e.target.value)}
              >
                <option value="navigation">Navegação por Categorias</option>
                <option value="direct">Exibição Direta (rolagem única)</option>
                <option value="cards">Cards de Categoria</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="combos-visibility">Visibilidade dos Combos</Label>
              <select
                id="combos-visibility"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={pizzeria?.site_settings?.combos_visibility || "auto"}
                onChange={(e) => handleSiteSettingUpdate("combos_visibility", e.target.value)}
              >
                <option value="auto">Automático (só se existir combo)</option>
                <option value="always">Sempre mostrar</option>
                <option value="hide">Ocultar</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-button-text">Texto do Botão Principal</Label>
            <Input
              id="hero-button-text"
              placeholder="Ex: Explorar Cardápio"
              defaultValue={pizzeria?.site_settings?.hero_button_text || ""}
              onBlur={(e) => handleSiteSettingUpdate("hero_button_text", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Exibir botão "Ir pra sacola" (carrinho)</p>
              <p className="text-[10px] text-muted-foreground">
                Mostra ou oculta o acesso ao carrinho no site público
              </p>
            </div>
            <Switch
              checked={pizzeria?.site_settings?.show_cart_button !== false}
              onCheckedChange={(checked) => handleSiteSettingUpdate("show_cart_button", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> Capa do Cardápio (Hero)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={(pizzeria?.hero_media_type ?? "image") !== "video" ? "default" : "outline"}
              onClick={() => handleUpdate("hero_media_type", "image")}
              disabled={saving}
            >
              Imagem
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pizzeria?.hero_media_type === "video" ? "default" : "outline"}
              onClick={() => handleUpdate("hero_media_type", "video")}
              disabled={saving}
            >
              Vídeo
            </Button>
          </div>

          {pizzeria?.hero_media_type === "video" ? (
            <VideoUpload
              value={pizzeria?.hero_video_url}
              onChange={(url) => handleUpdate("hero_video_url", url)}
              folder="hero"
              disabled={saving}
            />
          ) : (
            <ImageUpload
              value={pizzeria?.hero_image_url}
              onChange={(url) => handleUpdate("hero_image_url", url)}
              folder="hero"
              disabled={saving}
            />
          )}
          <p className="text-[10px] text-muted-foreground">
            Imagem ou vídeo que aparece no topo do site, atrás do nome da loja.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Identificação do Site
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug do Site (identificador único)</Label>
            <Input
              id="slug"
              placeholder="ex: pizzaria-do-joao"
              defaultValue={pizzeria?.slug || ""}
              onBlur={(e) => handleUpdate("slug", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              O slug deve ser idêntico ao configurado no SiteCreatorFly.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> Acesso à API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api_key">Chave de API (x-api-key)</Label>
            <Input
              id="api_key"
              type="password"
              placeholder="Sua chave de API"
              defaultValue={pizzeria?.api_key || ""}
              onBlur={(e) => handleUpdate("api_key", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Necessária para validar a sincronização segura dos dados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
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
import { ImageUpload } from "@/components/ui/image-upload";
import { VideoUpload } from "@/components/ui/video-upload";
import {
  Store,
  CreditCard,
  Loader2,
  Phone,
  MapPin,
  Clock,
  Image as ImageIcon,
  Heart,
  Palette,
  LayoutGrid,
  ShoppingBag,
  ShieldCheck,
  Type,
} from "lucide-react";
import { FlyStatusSettings } from "@/components/flystatus/FlyStatusSettings";
import { PizzeriaPromotion } from "@/components/pizzerias/PizzeriaPromotion";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { syncToExternal } from "@/utils/menuSync";
import { CheckoutLayoutPicker } from "@/components/store/CheckoutLayoutPicker";
import { AppearanceEditor } from "@/components/store/AppearanceEditor";
import { MenuTextsEditor } from "@/components/store/MenuTextsEditor";
import { HeroScheduleEditor } from "@/components/store/HeroScheduleEditor";
import { layoutPorId } from "@/lib/menu/layouts";
import {
  COMBOS_INFO,
  lojistaEscolheuModo,
  MODO_PADRAO_GLOBAL,
  MODOS_DE_NAVEGACAO,
  MODOS_INFO,
  resolverModoDeNavegacao,
  VISIBILIDADES_DE_COMBOS,
  visibilidadeDeCombosDe,
} from "@/lib/site/menuBehavior";
import { mensagemDoErro } from "@/lib/errors";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * A loja como ESTA tela a manipula.
 *
 * É a lista dos campos que a tela lê e grava — nada além. Escrever o nome de
 * um campo errado passa a ser erro na hora de editar, em vez de virar um
 * espaço em branco na tela do dono.
 *
 * `site_settings` é o pacotinho de ajustes extras que viaja inteiro para o
 * site público; por isso é um objeto solto, e não uma lista fixa de campos.
 */
type Loja = {
  id: string;
  name?: string | null;
  slug?: string | null;
  api_key?: string | null;
  description?: string | null;
  tagline?: string | null;
  short_message?: string | null;
  business_type?: string | null;
  phone?: string | null;
  whatsapp_display?: string | null;
  instagram_url?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  logo_url?: string | null;
  hero_image_url?: string | null;
  hero_video_url?: string | null;
  hero_media_type?: string | null;
  opening_hours?: unknown;
  payment_methods?: string[] | null;
  delivery_enabled?: boolean | null;
  pickup_enabled?: boolean | null;
  table_enabled?: boolean | null;
  is_open?: boolean | null;
  delivery_fee?: number | null;
  average_delivery_time?: string | null;
  sync_endpoint?: string | null;
  site_settings?: Record<string, unknown> | null;
  [outroCampo: string]: unknown;
};

export const Route = createFileRoute("/_app/my-store")({ component: MyStore });

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

// Os 5 modelos visuais e as cores de cada um vivem em `lib/theme/templates.ts`,
// que também alimenta a prévia da aba Aparência — uma lista só, para a prévia
// nunca mostrar um modelo que o site não tem.

// Campos desta tela que `prepareDataForExternal('restaurant', ...)` (em
// utils/menuSync.ts) sabe traduzir para o SiteCreatorFly. Campos fora deste
// conjunto (bairro, tempo de entrega, formas de pagamento, Instagram) são
// só do FlyControl e não têm correspondente no site público.
const RESTAURANT_SYNC_FIELDS = new Set([
  "name",
  "is_open",
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

/**
 * Formulário de "Minha Loja" de uma pizzaria específica.
 *
 * Não decide sozinho QUAL loja é essa — quem chama informa `pizzeriaId`. É o
 * que permite reaproveitar exatamente a mesma tela tanto para o dono (a loja
 * dele, sempre a mesma) quanto para um administrador (a loja que ele
 * escolheu no seletor, podendo trocar a qualquer momento).
 */
function StoreEditor({
  pizzeriaId,
  isAdminEditing,
}: {
  pizzeriaId: string;
  isAdminEditing: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A loja tem dezenas de campos e cada tela usa um punhado deles. `Loja` é o
  // formato que ESTA tela lê e grava — ver o tipo logo acima do componente.
  const [pizzeria, setPizzeria] = useState<Loja | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: pizzeriaData, error: pError } = await supabase
        .from("pizzerias")
        .select("*")
        .eq("id", pizzeriaId)
        .maybeSingle();

      if (pError) throw pError;
      setPizzeria(pizzeriaData as Loja | null);
    } catch (error) {
      toast.error("Erro ao carregar dados: " + mensagemDoErro(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaId]);

  // Lojas cadastradas antes de o FlyControl conectar automaticamente ao
  // SiteCreatorFly no momento do cadastro ficaram sem o "endereço" de
  // sincronização (sync_endpoint) — é como um cliente que fez cadastro antes
  // de existir o número de mesa automático: os dados dele existem, só falta
  // essa etiqueta. Busca essa etiqueta agora, na hora do primeiro salvamento,
  // em vez de deixar o dono da loja precisar achar um botão em outra tela.
  async function ensureSyncEndpoint(pz: Loja): Promise<string | undefined> {
    if (pz.sync_endpoint) return pz.sync_endpoint;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return undefined;

    try {
      const resp = await fetch(`/api/pizzerias/${pz.id}/provision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json?.success && json?.sync_endpoint) {
        return json.sync_endpoint as string;
      }
    } catch {
      // Segue sem endpoint — quem chamou decide como avisar.
    }
    return undefined;
  }

  // Cada campo salva e sincroniza com o SiteCreatorFly assim que é editado
  // (ao sair do campo, ou na hora, pros interruptores) — não existe mais um
  // botão único de "Salvar" que junta tudo: cada mudança já vale sozinha, e
  // o aviso mostrado reflete o que realmente aconteceu com essa mudança.
  async function handleUpdate(field: string, value: unknown) {
    await handleUpdateMany({ [field]: value });
  }

  /**
   * Grava vários campos de uma vez e avisa o site público uma vez só.
   *
   * A aba Aparência precisa disso: modelo, cor primária, cor secundária e o
   * interruptor das fotos saem juntos quando o lojista aperta "Salvar
   * alterações". Mandar um de cada vez faria o site trocar de cara quatro
   * vezes seguidas na frente de quem estivesse pedindo naquele momento.
   *
   * Devolve `true` só quando tudo deu certo — inclusive o aviso ao site.
   */
  async function handleUpdateMany(campos: Record<string, unknown>): Promise<boolean> {
    if (!pizzeria) return false;
    setSaving(true);
    const { error } = await supabase
      .from("pizzerias")
      .update(campos as TablesUpdate<"pizzerias">)
      .eq("id", pizzeria.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return false;
    }

    setPizzeria((prev) => (prev ? { ...prev, ...campos } : prev));

    const paraSincronizar = Object.fromEntries(
      Object.entries(campos).filter(([campo]) => RESTAURANT_SYNC_FIELDS.has(campo)),
    );

    if (Object.keys(paraSincronizar).length > 0 && pizzeria.slug) {
      if (!pizzeria.api_key) {
        toast.error("Salvo, mas o cardápio online desta loja ainda não está no ar.");
        setSaving(false);
        return false;
      }

      let syncEndpoint = pizzeria.sync_endpoint;
      if (!syncEndpoint) {
        syncEndpoint = await ensureSyncEndpoint(pizzeria);
        if (syncEndpoint) {
          setPizzeria((prev) => (prev ? { ...prev, sync_endpoint: syncEndpoint } : prev));
        }
      }

      if (!syncEndpoint) {
        toast.error(
          "Salvo, mas não consegui publicar no cardápio online agora. Tente novamente em instantes.",
        );
        setSaving(false);
        return false;
      }

      const syncResult = await syncToExternal({
        type: "restaurant",
        action: "update",
        id: pizzeria.id,
        pizzeriaSlug: pizzeria.slug,
        pizzeriaApiKey: pizzeria.api_key,
        syncEndpoint,
        data: paraSincronizar,
      });

      if (!syncResult.success) {
        toast.error(
          `Salvo, mas não foi possível atualizar o cardápio online${syncResult.error ? ` (${syncResult.error})` : ""}. Tente novamente em instantes.`,
        );
        setSaving(false);
        return false;
      }
    }

    toast.success("Salvo com sucesso!");
    setSaving(false);
    return true;
  }

  // `site_settings` é uma coluna única no banco (um "pacotinho" de várias
  // configurações juntas) — por isso, ao mudar uma só, primeiro juntamos ela
  // com o que já estava salvo nas outras, para não apagar as demais.
  function handleSiteSettingUpdate(key: string, value: unknown) {
    // Valor nulo é o pedido de APAGAR a escolha ("voltar ao automático"), e
    // ele precisa VIAJAR até o site público. Se aqui a chave só sumisse do
    // pacote, o site continuaria com a configuração antiga: a sincronização
    // junta o que chega com o que já existe lá, então o que não chega é o que
    // fica. É como riscar um nome só na sua cópia da lista de reservas — a
    // cópia da portaria continua com o nome escrito.
    const merged = { ...(pizzeria?.site_settings || {}), [key]: value ?? null };
    handleUpdate("site_settings", merged);
  }

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
        <p className="text-muted-foreground mt-2">
          Você precisa vincular uma pizzaria nas Configurações primeiro.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">Cadastrar loja</Link>
        </Button>
      </div>
    );
  }

  // O comportamento do cardápio, calculado exatamente como o site público
  // calcula. Se este cálculo divergir do de lá, o painel promete uma coisa e o
  // cardápio faz outra — que é justamente o problema que esta tela tinha.
  const layoutDaLoja = layoutPorId(pizzeria.site_settings?.menu_layout);
  const padraoDoLayout = layoutDaLoja?.modoDeNavegacaoPadrao ?? null;
  const escolheuModo = lojistaEscolheuModo(pizzeria.site_settings);
  const modoNoAr = resolverModoDeNavegacao(pizzeria.site_settings, padraoDoLayout);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Aviso de que quem está editando é um administrador, não o dono da
          loja — sem isso, um clique errado no seletor mudaria os dados de
          outra pizzaria sem ninguém perceber a troca de contexto. */}
      {isAdminEditing && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-300">
            <strong>Modo administrador:</strong> você está editando a loja{" "}
            <strong>{pizzeria.name}</strong>, não a sua própria conta. Toda alteração aqui já salva
            e publica no cardápio online dessa loja na hora.
          </p>
        </div>
      )}

      {/* Barra de Status Rápido */}
      <Card
        className={`border-2 ${pizzeria.is_open ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"}`}
      >
        <CardContent className="flex flex-col md:flex-row items-center justify-between p-4 gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center ${pizzeria.is_open ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
            >
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                Status da Loja:{" "}
                <span className={pizzeria.is_open ? "text-green-600" : "text-red-600"}>
                  {pizzeria.is_open ? "ABERTA" : "FECHADA"}
                </span>
              </h3>
              <p className="text-sm text-muted-foreground">
                {pizzeria.is_open
                  ? "Sua loja está recebendo pedidos normalmente."
                  : "Clientes podem ver o cardápio, mas não conseguem finalizar pedidos."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-background/50 p-2 rounded-lg border">
            <Switch
              checked={pizzeria.is_open ?? false}
              onCheckedChange={(checked) => handleUpdate("is_open", checked)}
              disabled={saving}
            />
            <Label className="font-semibold cursor-pointer">
              {pizzeria.is_open ? "Fechar Loja Agora" : "Abrir Loja Agora"}
            </Label>
          </div>
        </CardContent>
      </Card>

      <div>
        <h1 className="text-3xl font-bold">Minha Loja</h1>
        <p className="text-muted-foreground">
          Como sua loja aparece e funciona para quem vai pedir — cada mudança já salva e publica na
          hora. Só a aba Aparência espera você apertar "Salvar alterações".
        </p>
      </div>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 mb-8 h-auto">
          <TabsTrigger value="identity" className="gap-2">
            <Store className="h-4 w-4" /> Identidade
          </TabsTrigger>
          <TabsTrigger value="service" className="gap-2">
            <Clock className="h-4 w-4" /> Atendimento
          </TabsTrigger>
          <TabsTrigger value="delivery" className="gap-2">
            <CreditCard className="h-4 w-4" /> Entrega
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" /> Aparência
          </TabsTrigger>
          <TabsTrigger value="behavior" className="gap-2">
            <LayoutGrid className="h-4 w-4" /> Comportamento
          </TabsTrigger>
          <TabsTrigger value="texts" className="gap-2">
            <Type className="h-4 w-4" /> Textos
          </TabsTrigger>
          <TabsTrigger value="hero" className="gap-2">
            <ImageIcon className="h-4 w-4" /> Capa (Hero)
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
                    defaultValue={pizzeria.name || ""}
                    onBlur={(e) => handleUpdate("name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-type">Tipo de Negócio</Label>
                  <select
                    id="business-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={pizzeria.business_type || "Pizzaria"}
                    onChange={(e) => handleUpdate("business_type", e.target.value)}
                  >
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tagline">Slogan curto (aparece no topo do site)</Label>
                  <Input
                    id="tagline"
                    placeholder="Ex: A melhor pizza da região"
                    defaultValue={pizzeria.tagline || ""}
                    onBlur={(e) => handleUpdate("tagline", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    placeholder="Ex: Salvador, BA"
                    defaultValue={pizzeria.city || ""}
                    onBlur={(e) => handleUpdate("city", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição do Site</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Fale um pouco sobre a qualidade e tradição da sua loja..."
                  defaultValue={pizzeria.description || ""}
                  onBlur={(e) => handleUpdate("description", e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Logo da Loja</Label>
                  <ImageUpload
                    value={pizzeria.logo_url || ""}
                    onChange={(url) => handleUpdate("logo_url", url)}
                    folder="logos"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram (URL)</Label>
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="instagram"
                      placeholder="https://instagram.com/sualoja"
                      defaultValue={pizzeria.instagram_url || ""}
                      onBlur={(e) => handleUpdate("instagram_url", e.target.value)}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Só do FlyControl — não aparece no cardápio online.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="short-message">Mensagem Curta (uso interno do FlyControl)</Label>
                <Input
                  id="short-message"
                  placeholder="Ex: A melhor pizza da região!"
                  defaultValue={pizzeria.short_message || ""}
                  onBlur={(e) => handleUpdate("short_message", e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Campo antigo, separado do "Slogan curto" acima — este aqui não vai para o site
                  público.
                </p>
              </div>
            </CardContent>
          </Card>

          <PizzeriaPromotion
            pizzeria={{ ...pizzeria, name: pizzeria.name ?? "", slug: pizzeria.slug ?? "" }}
          />
        </TabsContent>

        <TabsContent value="service" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados de Atendimento</CardTitle>
              <CardDescription>
                Como os clientes entram em contato e onde você atende.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp de Pedidos (com DDD)</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="whatsapp"
                      placeholder="5571986182819"
                      inputMode="numeric"
                      defaultValue={pizzeria.phone || ""}
                      onBlur={(e) => handleUpdate("phone", e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp-display">WhatsApp exibido no rodapé</Label>
                  <Input
                    id="whatsapp-display"
                    placeholder="(71) 98618-2819"
                    defaultValue={pizzeria.whatsapp_display || ""}
                    onBlur={(e) =>
                      handleUpdate("whatsapp_display", formatPhoneMask(e.target.value))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço Completo</Label>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      defaultValue={pizzeria.address || ""}
                      onBlur={(e) => handleUpdate("address", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro/Região Base</Label>
                  <Input
                    id="neighborhood"
                    defaultValue={pizzeria.neighborhood || ""}
                    onBlur={(e) => handleUpdate("neighborhood", e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Só do FlyControl — não aparece no cardápio online.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-hours">Horário de Funcionamento</Label>
                <Textarea
                  id="opening-hours"
                  rows={3}
                  placeholder="Ex: Seg a Sex: 18h às 23h"
                  defaultValue={
                    typeof pizzeria.opening_hours === "string"
                      ? pizzeria.opening_hours
                      : JSON.stringify(pizzeria.opening_hours || "")
                  }
                  onBlur={(e) => {
                    const val = e.target.value;
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" /> Modos de Atendimento
              </CardTitle>
              <CardDescription>Como o cliente pode comprar no cardápio online.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Delivery</p>
                  <p className="text-[10px] text-muted-foreground">Entrega</p>
                </div>
                <Switch
                  checked={pizzeria.delivery_enabled ?? true}
                  onCheckedChange={(checked) => handleUpdate("delivery_enabled", checked)}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Retirada</p>
                  <p className="text-[10px] text-muted-foreground">Cliente busca no local</p>
                </div>
                <Switch
                  checked={pizzeria.pickup_enabled ?? false}
                  onCheckedChange={(checked) => handleUpdate("pickup_enabled", checked)}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Consumo Local</p>
                  <p className="text-[10px] text-muted-foreground">Mesa / Comanda</p>
                </div>
                <Switch
                  checked={pizzeria.table_enabled ?? false}
                  onCheckedChange={(checked) => handleUpdate("table_enabled", checked)}
                  disabled={saving}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FlyStatusSettings
                pizzeria={
                  pizzeria as unknown as Parameters<typeof FlyStatusSettings>[0]["pizzeria"]
                }
                onUpdated={(patch) => setPizzeria((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
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
                    defaultValue={pizzeria.delivery_fee || 0}
                    onBlur={(e) => handleUpdate("delivery_fee", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-time">Tempo Médio de Entrega</Label>
                  <Input
                    id="delivery-time"
                    placeholder="Ex: 40-50 min"
                    defaultValue={pizzeria.average_delivery_time || ""}
                    onBlur={(e) => handleUpdate("average_delivery_time", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Formas de Pagamento Aceitas</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    "Pix",
                    "Cartão de Crédito",
                    "Cartão de Débito",
                    "Dinheiro",
                    "Vale Refeição",
                  ].map((method) => {
                    const methods = Array.isArray(pizzeria.payment_methods)
                      ? pizzeria.payment_methods
                      : [];
                    const isChecked = methods.includes(method);
                    return (
                      <div
                        key={method}
                        className="flex items-center space-x-2 border rounded-md p-2"
                      >
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const newMethods = checked
                              ? [...methods, method]
                              : methods.filter((m: string) => m !== method);
                            handleUpdate("payment_methods", newMethods);
                          }}
                          disabled={saving}
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

        <TabsContent value="appearance" className="space-y-6">
          <AppearanceEditor pizzeria={pizzeria} salvando={saving} onSalvar={handleUpdateMany} />
        </TabsContent>

        <TabsContent value="texts" className="space-y-6">
          <MenuTextsEditor
            siteSettings={pizzeria.site_settings ?? null}
            salvando={saving}
            // Os textos entram no mesmo pacotinho das outras configurações da
            // loja, e por isso viajam para o site público pelo caminho que já
            // existe — sem endereço novo nem sincronização própria.
            aoSalvar={(textos) =>
              handleUpdateMany({
                site_settings: {
                  ...(pizzeria.site_settings || {}),
                  menu_texts: textos,
                },
              })
            }
          />
        </TabsContent>

        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-primary" /> Comportamento do Cardápio
              </CardTitle>
              <CardDescription>
                Como o cardápio se comporta para quem visita o site.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-mode">Modo de Navegação</Label>
                  <select
                    id="entry-mode"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    // Controlado, e não `defaultValue`: o que aparece na tela é
                    // o que está gravado, sempre. Com `defaultValue` a tela
                    // podia continuar mostrando a opção antiga depois de salvar
                    // — como um cardápio impresso que não acompanha a cozinha.
                    value={escolheuModo ? String(pizzeria.site_settings?.entry_mode) : ""}
                    disabled={saving}
                    onChange={(e) => handleSiteSettingUpdate("entry_mode", e.target.value || null)}
                  >
                    <option value="">
                      {padraoDoLayout
                        ? `Automático — ${MODOS_INFO[padraoDoLayout].rotulo}`
                        : `Automático — ${MODOS_INFO[MODO_PADRAO_GLOBAL].rotulo}`}
                    </option>
                    {MODOS_DE_NAVEGACAO.map((m) => (
                      <option key={m} value={m}>
                        {MODOS_INFO[m].rotulo}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      No ar agora: {MODOS_INFO[modoNoAr].rotulo}
                    </span>
                    {" — "}
                    {MODOS_INFO[modoNoAr].descricao}
                  </p>
                  {!escolheuModo && (
                    <p className="text-[10px] text-muted-foreground">
                      Nada escolhido aqui: o cardápio usa
                      {padraoDoLayout
                        ? ` o padrão do layout "${layoutDaLoja?.nome}"`
                        : " o padrão de sempre"}
                      .
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="combos-visibility">Visibilidade dos Combos</Label>
                  <select
                    id="combos-visibility"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={visibilidadeDeCombosDe(pizzeria.site_settings)}
                    disabled={saving}
                    onChange={(e) => handleSiteSettingUpdate("combos_visibility", e.target.value)}
                  >
                    {VISIBILIDADES_DE_COMBOS.map((v) => (
                      <option key={v} value={v}>
                        {COMBOS_INFO[v]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero-button-text">Texto do Botão Principal</Label>
                <Input
                  id="hero-button-text"
                  placeholder="Ex: Explorar Cardápio"
                  defaultValue={String(pizzeria.site_settings?.hero_button_text ?? "")}
                  onBlur={(e) => handleSiteSettingUpdate("hero_button_text", e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Exibir botão "Ir pra sacola" (carrinho)</p>
                  <p className="text-[10px] text-muted-foreground">
                    Mostra ou oculta o acesso ao carrinho no cardápio online
                  </p>
                </div>
                <Switch
                  checked={pizzeria.site_settings?.show_cart_button !== false}
                  onCheckedChange={(checked) =>
                    handleSiteSettingUpdate("show_cart_button", checked)
                  }
                  disabled={saving}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" /> Modelo do Checkout
              </CardTitle>
              <CardDescription>
                Como a tela de finalizar o pedido aparece para o cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CheckoutLayoutPicker
                current={pizzeria.site_settings?.checkout_layout}
                saving={saving}
                onSave={(layout) => handleSiteSettingUpdate("checkout_layout", layout)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hero" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" /> Capa do Cardápio (Hero)
              </CardTitle>
              <CardDescription>
                Imagem ou vídeo que aparece no topo do site, atrás do nome da loja.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    (pizzeria.hero_media_type ?? "image") !== "video" ? "default" : "outline"
                  }
                  onClick={() => handleUpdate("hero_media_type", "image")}
                  disabled={saving}
                >
                  Imagem
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pizzeria.hero_media_type === "video" ? "default" : "outline"}
                  onClick={() => handleUpdate("hero_media_type", "video")}
                  disabled={saving}
                >
                  Vídeo
                </Button>
              </div>

              {pizzeria.hero_media_type === "video" ? (
                <VideoUpload
                  value={pizzeria.hero_video_url}
                  onChange={(url) => handleUpdate("hero_video_url", url)}
                  folder="hero"
                  disabled={saving}
                />
              ) : (
                <ImageUpload
                  value={pizzeria.hero_image_url}
                  onChange={(url) => handleUpdate("hero_image_url", url)}
                  folder="hero"
                  disabled={saving}
                />
              )}
            </CardContent>
          </Card>

          {/* A capa fixa acima continua sendo a CAPA PADRÃO: é ela que aparece
              quando não há programação valendo. A automação entra abaixo. */}
          <HeroScheduleEditor
            siteSettings={pizzeria.site_settings ?? null}
            capaFixa={{
              tipo: pizzeria.hero_media_type === "video" ? "video" : "imagem",
              url:
                pizzeria.hero_media_type === "video"
                  ? (pizzeria.hero_video_url ?? null)
                  : (pizzeria.hero_image_url ?? null),
            }}
            salvando={saving}
            aoSalvar={(programacao) =>
              handleUpdateMany({
                site_settings: {
                  ...(pizzeria.site_settings || {}),
                  hero_schedule: programacao,
                },
              })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type PizzeriaOption = { id: string; name: string; slug: string; status: string };

/**
 * Dono de loja: cai direto na própria loja, como sempre foi.
 *
 * Administrador: primeiro escolhe, no mesmo seletor já usado em Cardápio e
 * Combos, qual loja quer editar — sem isso ele sempre caía na loja mais
 * antiga cadastrada, sem chance de escolher outra.
 */
export default function MyStore() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzerias, setPizzerias] = useState<PizzeriaOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadPizzerias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPizzerias() {
    setLoading(true);
    let query = supabase
      .from("pizzerias")
      .select("id, name, slug, status")
      .neq("status", "deleted")
      .order("name");

    if (!isSuperAdmin && user?.id) {
      query = query.eq("owner_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar lojas: " + error.message);
      setLoading(false);
      return;
    }

    setPizzerias(data ?? []);

    if (!isSuperAdmin) {
      // Dono só tem a própria loja: entra direto, sem seletor.
      setActiveId(data?.[0]?.id ?? null);
    } else if (data && data.length) {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get("pizzeriaId");
      // Só usa o id da URL se ele realmente estiver na lista — evita ficar
      // preso numa loja excluída ou de outro administrador que não existe
      // mais aqui.
      setActiveId(pId && data.some((p) => p.id === pId) ? pId : null);
    }

    setLoading(false);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("pizzeriaId", id);
    window.history.replaceState({}, "", url);
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pizzerias.length) {
    return (
      <div className="p-8 text-center">
        <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold">Nenhuma loja encontrada</h2>
        <p className="text-muted-foreground mt-2">
          Você precisa vincular uma pizzaria nas Configurações primeiro.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">Cadastrar loja</Link>
        </Button>
      </div>
    );
  }

  if (isSuperAdmin && !activeId) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Minha Loja</h1>
          <p className="text-muted-foreground">Escolha qual loja você quer visualizar e editar.</p>
        </div>
        <PizzeriaSelector pizzerias={pizzerias} activeId={activeId} onSelect={handleSelect} />
      </div>
    );
  }

  if (!activeId) return null;

  return (
    <div className="space-y-6">
      {isSuperAdmin && (
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pt-6 sm:flex-row sm:items-center sm:justify-between md:px-8 md:pt-8">
          <p className="text-sm text-muted-foreground">Editando como administrador:</p>
          <div className="w-full sm:w-auto">
            <PizzeriaSelector pizzerias={pizzerias} activeId={activeId} onSelect={handleSelect} />
          </div>
        </div>
      )}
      <StoreEditor pizzeriaId={activeId} isAdminEditing={isSuperAdmin} />
    </div>
  );
}

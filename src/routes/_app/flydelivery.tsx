/**
 * FlyDelivery — o painel da vitrine do aplicativo.
 *
 * O QUE ESTA TELA É
 *
 * O FlyDelivery é o aplicativo de celular onde o cliente final encontra a sua
 * loja e faz o pedido. Esta tela controla como a sua loja aparece lá.
 *
 * O QUE ELA NÃO É
 *
 * Não é um segundo cardápio. O cardápio do FlyDelivery é o MESMO que você já
 * mantém em "Cardápio" — mudou o preço lá, mudou no aplicativo. Aqui só se
 * decide se a loja aparece, se aceita pedido e quanto custa entregar em cada
 * bairro.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, Plus, Smartphone, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// Ainda não lançado: some do menu, e o servidor responde 503 antes de
// chegar aqui (ver ROTAS_NAO_LANCADAS em src/lib/naoLancadas.ts).
export const Route = createFileRoute("/_app/flydelivery")({ component: FlyDeliveryPage });

type Pizzeria = {
  id: string;
  name: string;
  flydelivery_enabled: boolean;
  flydelivery_accept_orders: boolean;
  flydelivery_paused: boolean;
  flydelivery_category: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_fee: number | null;
  min_order_value: number | null;
  delivery_radius_km: number | null;
  average_delivery_time: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Zone = {
  id: string;
  store_id: string;
  zone_type: "neighborhood" | "radius";
  name: string;
  neighborhood: string | null;
  radius_km: number | null;
  delivery_fee: number;
  min_order_value: number;
  estimated_minutes: number | null;
  active: boolean;
};

type Category = { slug: string; name: string };

/** Um dia do relatório, do jeito que a função do banco devolve. */
type AnalyticsRow = {
  day: string;
  store_views: number;
  product_views: number;
  add_to_carts: number;
  checkout_starts: number;
  orders_count: number;
  revenue: number;
  avg_ticket: number;
};

type TopProduct = { product_name: string; quantity: number; revenue: number };

/**
 * O formato de atualização vem do TIPO GERADO pelo banco, não de uma cópia
 * feita à mão: assim, se uma coluna mudar lá, o erro aparece aqui na hora de
 * compilar em vez de virar falha silenciosa em produção.
 */
type PizzeriaUpdate = Database["public"]["Tables"]["pizzerias"]["Update"];

function FlyDeliveryPage() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pizzerias, setPizzerias] = useState<Pizzeria[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () => pizzerias.find((p) => p.id === activeId) ?? null,
    [pizzerias, activeId],
  );

  const load = useCallback(async () => {
    if (!user) return;
    try {
      let query = supabase
        .from("pizzerias")
        .select(
          "id, name, flydelivery_enabled, flydelivery_accept_orders, flydelivery_paused, " +
            "flydelivery_category, delivery_enabled, pickup_enabled, delivery_fee, " +
            "min_order_value, delivery_radius_km, average_delivery_time, latitude, longitude",
        )
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("name");

      if (!isSuperAdmin && user?.id) query = query.eq("owner_id", user.id);

      const [{ data, error }, cats] = await Promise.all([
        query,
        supabase
          .from("flydelivery_categories")
          .select("slug, name")
          .eq("active", true)
          .order("sort_order"),
      ]);

      if (error) throw error;
      // A consulta é montada em pedaços (o filtro por dono entra só para
      // quem não é administrador), e nesse caso o TypeScript não consegue
      // deduzir o formato sozinho — daí a conversão explícita.
      const list = (data ?? []) as unknown as Pizzeria[];
      setPizzerias(list);
      setCategories((cats.data ?? []) as Category[]);
      if (list.length && !activeId) setActiveId(list[0].id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "tente de novo";
      toast.error("Erro ao carregar: " + message);
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin, activeId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  /** Salva um campo e já reflete na tela, sem recarregar tudo. */
  const update = async (patch: PizzeriaUpdate) => {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase.from("pizzerias").update(patch).eq("id", active.id);
    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    setPizzerias((current) => current.map((p) => (p.id === active.id ? { ...p, ...patch } : p)));
    toast.success("Salvo");
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Nenhuma loja encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Smartphone className="h-6 w-6 text-primary" />
            FlyDelivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Como a sua loja aparece no aplicativo. O cardápio é o mesmo que você já mantém em
            “Cardápio” — aqui não se cadastra produto de novo.
          </p>
        </div>
        {pizzerias.length > 1 ? (
          <PizzeriaSelector
            pizzerias={pizzerias.map((p) => ({ id: p.id, name: p.name }))}
            activeId={activeId}
            onSelect={setActiveId}
          />
        ) : null}
      </div>

      <Tabs defaultValue="presenca">
        <TabsList>
          <TabsTrigger value="presenca">Presença</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
          <TabsTrigger value="areas">Áreas e taxas</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
        </TabsList>

        {/* ---------------- PRESENÇA ---------------- */}
        <TabsContent value="presenca" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Aparecer no aplicativo</CardTitle>
              <CardDescription>
                Desligado, sua loja simplesmente não existe para quem usa o FlyDelivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ToggleRow
                label="Exibir meu estabelecimento no FlyDelivery"
                hint="É a chave geral da vitrine."
                checked={active.flydelivery_enabled}
                onChange={(v) => update({ flydelivery_enabled: v })}
                disabled={saving}
              />
              <ToggleRow
                label="Aceitar pedidos pelo FlyDelivery"
                hint="Desligado, a loja aparece e o cardápio pode ser visto, mas ninguém consegue pedir."
                checked={active.flydelivery_accept_orders}
                onChange={(v) => update({ flydelivery_accept_orders: v })}
                disabled={saving || !active.flydelivery_enabled}
              />
              <ToggleRow
                label="Pausar loja temporariamente"
                hint="Para quando a cozinha não está dando conta. A loja aparece como “Pausado” e volta com um clique."
                checked={active.flydelivery_paused}
                onChange={(v) => update({ flydelivery_paused: v })}
                disabled={saving || !active.flydelivery_enabled}
                danger
              />

              <div className="space-y-2 border-t pt-4">
                <Label>Categoria no aplicativo</Label>
                <Select
                  value={active.flydelivery_category ?? ""}
                  onValueChange={(v) => update({ flydelivery_category: v })}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Deduzida pelo nome da loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sem escolher, o aplicativo deduz pelo nome (“Pizzaria …” vira Pizzarias).
                  Escolhendo aqui, a sua escolha vale.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- ENTREGA ---------------- */}
        <TabsContent value="entrega" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Como você atende</CardTitle>
              <CardDescription>
                O aplicativo só oferece ao cliente o que estiver ligado aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ToggleRow
                label="Permitir entrega"
                checked={active.delivery_enabled}
                onChange={(v) => update({ delivery_enabled: v })}
                disabled={saving}
              />
              <ToggleRow
                label="Permitir retirada no balcão"
                checked={active.pickup_enabled}
                onChange={(v) => update({ pickup_enabled: v })}
                disabled={saving}
              />

              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                <NumberField
                  label="Taxa de entrega padrão (R$)"
                  hint="Vale quando o bairro do cliente não estiver em nenhuma área cadastrada."
                  value={active.delivery_fee}
                  onSave={(v) => update({ delivery_fee: v })}
                />
                <NumberField
                  label="Pedido mínimo (R$)"
                  hint="Zero = sem mínimo."
                  value={active.min_order_value}
                  // Esta coluna não aceita vazio no banco: apagar o campo
                  // significa "sem mínimo", que é zero.
                  onSave={(v) => update({ min_order_value: v ?? 0 })}
                />
                <NumberField
                  label="Raio de entrega (km)"
                  hint="Vazio = sem limite declarado."
                  value={active.delivery_radius_km}
                  onSave={(v) => update({ delivery_radius_km: v })}
                />
                <div className="space-y-1">
                  <Label>Tempo estimado</Label>
                  <Input
                    defaultValue={active.average_delivery_time ?? ""}
                    placeholder="Ex.: 30-45"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (active.average_delivery_time ?? "")) {
                        update({ average_delivery_time: v || null });
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aparece como “30–45 min” no card da loja.
                  </p>
                </div>
              </div>

              {active.latitude == null || active.longitude == null ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Sua loja ainda não tem ponto no mapa.</strong> Sem a latitude e a
                  longitude, o aplicativo não mostra a distância até o cliente nem consegue usar
                  áreas por raio — só as áreas por bairro funcionam. Preencher isso é o próximo
                  passo para aparecer em “Perto de você”.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- ÁREAS ---------------- */}
        <TabsContent value="areas" className="pt-4">
          <ZonesEditor storeId={active.id} />
        </TabsContent>

        {/* ---------------- DESEMPENHO ---------------- */}
        <TabsContent value="desempenho" className="pt-4">
          <AnalyticsPanel storeId={active.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  danger,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label className={danger && checked ? "text-destructive" : undefined}>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onSave,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next = raw === "" ? null : Number(raw);
          if (next !== value && (next === null || Number.isFinite(next))) onSave(next);
        }}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Áreas de entrega.
 *
 * Sem nenhuma área cadastrada, vale a taxa padrão para todo mundo — que é como
 * funcionava antes. Cadastrando, cada bairro pode ter a própria taxa e o
 * próprio mínimo, e quem ficar de fora de todas as áreas não consegue fechar
 * pedido de entrega.
 */
function ZonesEditor({ storeId }: { storeId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    zone_type: "neighborhood" as "neighborhood" | "radius",
    name: "",
    neighborhood: "",
    radius_km: "",
    delivery_fee: "",
    min_order_value: "",
    estimated_minutes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flydelivery_delivery_zones")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order")
      .order("created_at");
    if (error) toast.error("Erro ao carregar áreas: " + error.message);
    setZones((data ?? []) as Zone[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const isNeighborhood = form.zone_type === "neighborhood";
    if (isNeighborhood && !form.neighborhood.trim()) {
      toast.error("Informe o bairro.");
      return;
    }
    if (!isNeighborhood && !form.radius_km) {
      toast.error("Informe a distância em km.");
      return;
    }

    const { error } = await supabase.from("flydelivery_delivery_zones").insert({
      store_id: storeId,
      zone_type: form.zone_type,
      name:
        form.name.trim() ||
        (isNeighborhood ? form.neighborhood.trim() : `Até ${form.radius_km} km`),
      neighborhood: isNeighborhood ? form.neighborhood.trim() : null,
      radius_km: isNeighborhood ? null : Number(form.radius_km),
      delivery_fee: Number(form.delivery_fee || 0),
      min_order_value: Number(form.min_order_value || 0),
      estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
    });

    if (error) {
      toast.error("Não foi possível adicionar: " + error.message);
      return;
    }
    setForm({
      zone_type: "neighborhood",
      name: "",
      neighborhood: "",
      radius_km: "",
      delivery_fee: "",
      min_order_value: "",
      estimated_minutes: "",
    });
    toast.success("Área adicionada");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("flydelivery_delivery_zones").delete().eq("id", id);
    if (error) return toast.error("Não foi possível remover.");
    load();
  };

  const toggle = async (zone: Zone) => {
    const { error } = await supabase
      .from("flydelivery_delivery_zones")
      .update({ active: !zone.active })
      .eq("id", zone.id);
    if (error) return toast.error("Não foi possível alterar.");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Áreas de entrega e taxas
        </CardTitle>
        <CardDescription>
          Cobre valores diferentes por bairro ou por distância. Sem nenhuma área cadastrada, vale a
          taxa padrão para todo mundo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma área cadastrada. Todos os endereços pagam a taxa padrão.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {zones.map((zone) => (
              <div key={zone.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p
                    className={`font-medium ${zone.active ? "" : "text-muted-foreground line-through"}`}
                  >
                    {zone.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {zone.zone_type === "neighborhood"
                      ? `Bairro: ${zone.neighborhood}`
                      : `Até ${zone.radius_km} km`}
                    {" · "}Taxa R$ {Number(zone.delivery_fee).toFixed(2)}
                    {Number(zone.min_order_value) > 0
                      ? ` · Mínimo R$ ${Number(zone.min_order_value).toFixed(2)}`
                      : ""}
                    {zone.estimated_minutes ? ` · ${zone.estimated_minutes} min` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={zone.active} onCheckedChange={() => toggle(zone)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(zone.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-md border border-dashed p-4">
          <p className="text-sm font-medium">Adicionar área</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={form.zone_type}
                onValueChange={(v: "neighborhood" | "radius") =>
                  setForm((f) => ({ ...f, zone_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neighborhood">Por bairro</SelectItem>
                  <SelectItem value="radius">Por distância (km)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.zone_type === "neighborhood" ? (
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input
                  value={form.neighborhood}
                  onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
                  placeholder="Sete de Abril"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Até quantos km</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.radius_km}
                  onChange={(e) => setForm((f) => ({ ...f, radius_km: e.target.value }))}
                  placeholder="5"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Taxa (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.delivery_fee}
                onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))}
                placeholder="8.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Pedido mínimo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_order_value}
                onChange={(e) => setForm((f) => ({ ...f, min_order_value: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Tempo (min)</Label>
              <Input
                type="number"
                value={form.estimated_minutes}
                onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))}
                placeholder="45"
              />
            </div>
          </div>
          <Button onClick={add} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar área
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Desempenho no FlyDelivery.
 *
 * A conta é feita no banco e volta pronta — mandar milhares de eventos para o
 * navegador somar deixaria a tela lenta.
 */
function AnalyticsPanel({ storeId }: { storeId: string }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [customers, setCustomers] = useState<{
    new_customers: number;
    returning_customers: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [a, t, c] = await Promise.all([
        supabase.rpc("flydelivery_store_analytics", { p_store_id: storeId, p_from: from }),
        supabase.rpc("flydelivery_store_top_products", { p_store_id: storeId, p_from: from }),
        supabase.rpc("flydelivery_store_customers", { p_store_id: storeId, p_from: from }),
      ]);
      if (!alive) return;
      setRows((a.data ?? []) as AnalyticsRow[]);
      setTop((t.data ?? []) as TopProduct[]);
      setCustomers((c.data ?? [])[0] ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [storeId, days]);

  const totals = useMemo(() => {
    const sum = (k: keyof AnalyticsRow) => rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
    const orders = sum("orders_count");
    const views = sum("store_views");
    const revenue = sum("revenue");
    return {
      views,
      productViews: sum("product_views"),
      carts: sum("add_to_carts"),
      checkouts: sum("checkout_starts"),
      orders,
      revenue,
      ticket: orders > 0 ? revenue / orders : 0,
      conversion: views > 0 ? (orders / views) * 100 : 0,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { d: 1, l: "Hoje" },
          { d: 7, l: "7 dias" },
          { d: 30, l: "30 dias" },
          { d: 90, l: "90 dias" },
        ].map((opt) => (
          <Button
            key={opt.d}
            size="sm"
            variant={days === opt.d ? "default" : "outline"}
            onClick={() => setDays(opt.d)}
          >
            {opt.l}
          </Button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Visitas à loja" value={totals.views} />
            <Metric label="Produtos vistos" value={totals.productViews} />
            <Metric label="Adições ao carrinho" value={totals.carts} />
            <Metric label="Checkouts iniciados" value={totals.checkouts} />
            <Metric label="Pedidos" value={totals.orders} highlight />
            <Metric
              label="Conversão"
              value={`${totals.conversion.toFixed(1).replace(".", ",")}%`}
              hint="pedidos ÷ visitas"
            />
            <Metric
              label="Faturamento"
              value={`R$ ${totals.revenue.toFixed(2).replace(".", ",")}`}
            />
            <Metric
              label="Ticket médio"
              value={`R$ ${totals.ticket.toFixed(2).replace(".", ",")}`}
            />
          </div>

          {customers ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Clientes novos" value={customers.new_customers} />
              <Metric label="Clientes que voltaram" value={customers.returning_customers} />
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Produtos mais vendidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pedido pelo FlyDelivery neste período.
                </p>
              ) : (
                <div className="divide-y">
                  {top.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span className="truncate">{p.product_name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.quantity}x · R$ {Number(p.revenue).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {totals.views === 0 && totals.orders === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ainda não há movimento registrado. Os números começam a aparecer quando clientes
              abrirem sua loja no aplicativo.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

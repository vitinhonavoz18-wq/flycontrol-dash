import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, BellOff, Printer, Phone, MapPin, Clock, Plus, Copy, Check, Trash2, AlertTriangle } from "lucide-react";
import { FlyStatusModal, getFlyStatusKind, type FlyStatusKind, type FlyStatusPizzeria } from "@/components/flystatus/FlyStatusModal";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

type Pizzeria = {
  id: string; name: string; slug: string; api_key: string; status: string;
  sound_enabled: boolean; print_auto: boolean;
};
type Order = {
  id: string; order_number: number; tenant_id: string; customer_name: string;
  customer_phone: string; customer_address: string | null; neighborhood: string | null;
  items: any; total: number; delivery_fee: number; payment_method: string | null;
  change_for: number | null; notes: string | null; status: string; created_at: string;
};

const STATUSES = [
  { value: "novo", label: "Novo", color: "bg-primary text-primary-foreground shadow-sm" },
  { value: "preparando", label: "Preparando", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { value: "saiu", label: "Saiu para entrega", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "entregue", label: "Entregue", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { value: "cancelado", label: "Cancelado", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
];

function playBeep() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.65);
  } catch {}
}

function Dashboard() {
  const { user, isSuperAdmin, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [pizzerias, setPizzerias] = useState<Pizzeria[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("ativos");
  const [soundOn, setSoundOn] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState(false);
  const initialLoad = useRef(true);
  const soundOnRef = useRef(soundOn);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const pId = params.get("pizzeriaId");
    if (pId) setActiveId(pId);
  }, []);

  useEffect(() => {
    if (!loading && user) loadPizzerias();
  }, [loading, user, isSuperAdmin]);

  async function loadPizzerias() {
    let query = supabase.from("pizzerias").select("*").neq("status", "deleted").order("created_at");
    
    // Se não for super admin, filtra apenas as pizzarias do dono
    if (!isSuperAdmin && user?.id) {
      query = query.eq("owner_id", user.id);
    }
    
    const { data, error } = await query;
    if (error) { toast.error(error.message); return; }
    setPizzerias(data ?? []);
    if (data && data.length && !activeId) setActiveId(data[0].id);
  }

  useEffect(() => {
    if (!activeId) return;
    initialLoad.current = true;
    fetchOrders(activeId);
    const ch = subscribeToOrders(activeId);
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  async function fetchOrders(pizzeriaId: string) {
    const load = () => supabase.from("orders").select("*").eq("tenant_id", pizzeriaId)
      .neq("status", "deleted").order("created_at", { ascending: false }).limit(200);

    const { data, error } = await load();
    if (error?.message.includes("JWT expired")) {
      console.log("Session expired, refreshing...");
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session) {
        const { data: retryData, error: retryError } = await load();
        if (retryError) toast.error(retryError.message);
        else setOrders((retryData ?? []) as Order[]);
      } else {
        toast.error("Sessão expirada. Faça login novamente.");
      }
    } else if (error) {
      toast.error(error.message);
    } else {
      setOrders((data ?? []) as Order[]);
    }
    initialLoad.current = false;
  }

  function subscribeToOrders(pizzeriaId: string) {
    return supabase.channel(`orders-${pizzeriaId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${pizzeriaId}` }, (p) => {
        const o = p.new as Order;
        setOrders((prev) => prev.some((x) => x.id === o.id) ? prev : [o, ...prev]);
        if (soundOnRef.current) playBeep();
        toast.success(`Novo pedido #${o.order_number} — ${o.customer_name}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `tenant_id=eq.${pizzeriaId}` }, (p) => {
        const o = p.new as Order;
        setOrders((prev) => prev.map((x) => x.id === o.id ? o : x));
      })
      .subscribe();
  }

  const active = pizzerias.find((p) => p.id === activeId);
  const filtered = useMemo(() => {
    if (filter === "ativos") return orders.filter((o) => !["entregue", "cancelado", "deleted"].includes(o.status));
    if (filter === "todos") return orders.filter((o) => o.status !== "deleted");
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function deleteOrder(o: Order) {
    if (!confirm("Tem certeza que deseja excluir este pedido? O valor deste pedido será removido da gestão e dos relatórios.")) return;
    
    const { error } = await supabase.from("orders").update({ status: 'deleted' }).eq("id", o.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Pedido excluído com sucesso. Gestão atualizada automaticamente.");
      setOrders(prev => prev.filter(x => x.id !== o.id));
    }
  }

  async function clearAllOrders() {
    if (!activeId) return;
    if (!confirm("Essa ação irá remover todos os pedidos desta pizzaria e zerar a gestão. Tem certeza?")) return;
    if (!confirm("CONFIRMAÇÃO FINAL: Você tem certeza absoluta? Isso não pode ser desfeito.")) return;

    const { error } = await supabase.from("orders").update({ status: 'deleted' }).eq("tenant_id", activeId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Todos os pedidos foram removidos. Gestão zerada.");
      setOrders([]);
    }
  }

  const [flyStatus, setFlyStatus] = useState<{ open: boolean; kind: FlyStatusKind | null; order: Order | null }>({ open: false, kind: null, order: null });

  async function changeStatus(o: Order, status: string) {
    if (status === o.status) return;
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    const kind = getFlyStatusKind(status);
    if (kind) setFlyStatus({ open: true, kind, order: { ...o, status } });
  }

  async function createPizzeria(form: { name: string; slug: string; phone: string; address: string; api_key?: string }) {
    const isConnect = !!form.api_key;
    let targetPizzeriaId: string | null = null;
    let finalData: any = null;

    if (isConnect) {
      // Search for existing pizzeria by API Key or Slug
      // Using .or for flexibility as requested
      const { data: existing, error: searchError } = await supabase
        .from("pizzerias")
        .select("*")
        .or(`api_key.eq.${form.api_key},slug.eq.${form.slug}`)
        .maybeSingle();

      if (searchError) {
        toast.error("Erro ao buscar pizzaria: " + searchError.message);
        return;
      }

      if (existing) {
        // Claim ownership if not already owned or if user is admin
        if (existing.owner_id && existing.owner_id !== user?.id && !isSuperAdmin) {
          toast.error("Esta pizzaria já possui um dono vinculado.");
          return;
        }

        const { data: updated, error: updateError } = await supabase
          .from("pizzerias")
          .update({ 
            owner_id: user!.id,
            status: 'active'
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) {
          toast.error("Erro ao conectar pizzaria: " + updateError.message);
          return;
        }
        finalData = updated;
        targetPizzeriaId = updated.id;
      } else {
        toast.error("Pizzaria não encontrada com os dados informados.");
        return;
      }
    } else {
      // Create new
      const slug = form.slug?.trim().toLowerCase() || form.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      
      if (!slug) {
        toast.error("Nome ou slug inválido");
        return;
      }

      const apiKey = "fc_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data, error } = await supabase.from("pizzerias").insert({
        name: form.name, 
        slug: slug, 
        phone: form.phone, 
        address: form.address,
        api_key: apiKey, 
        owner_id: user!.id,
        status: "active"
      }).select("*").single();

      if (error) {
        toast.error(error.message);
        return;
      }
      finalData = data;
      targetPizzeriaId = data.id;
    }

    if (targetPizzeriaId) {
      // Sincronização: buscar contagens para informar o usuário
      const [categoriesCount, productsCount, extrasCount, combosCount] = await Promise.all([
        supabase.from("menu_categories").select("*", { count: 'exact', head: true }).eq("pizzeria_id", targetPizzeriaId),
        supabase.from("menu_products").select("*", { count: 'exact', head: true }).eq("pizzeria_id", targetPizzeriaId),
        supabase.from("menu_extras").select("*", { count: 'exact', head: true }).eq("pizzeria_id", targetPizzeriaId),
        supabase.from("combos").select("*", { count: 'exact', head: true }).eq("pizzeria_id", targetPizzeriaId),
      ]);

      const counts = {
        cats: categoriesCount.count || 0,
        prods: productsCount.count || 0,
        extras: extrasCount.count || 0,
        combos: combosCount.count || 0,
      };

      if (isConnect && (counts.cats > 0 || counts.prods > 0)) {
        toast.success(`Cardápio sincronizado com sucesso. Encontramos ${counts.cats} categorias, ${counts.prods} produtos, ${counts.extras} complementos e ${counts.combos} combos.`);
      } else if (isConnect) {
        toast.info("Pizzaria conectada. Nenhum item encontrado no cardápio desta pizzaria. Você pode cadastrar novos itens pelo FlyControl.");
      } else {
        toast.success("Pizzaria criada com sucesso!");
      }

      setPizzerias((p) => {
        const filtered = p.filter(x => x.id !== targetPizzeriaId);
        return [...filtered, finalData].sort((a, b) => a.name.localeCompare(b.name));
      });
      setActiveId(targetPizzeriaId);
      setShowNew(false);
    }
  }

  if (!mounted) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

  if (!pizzerias.length) {
    return (
      <div className="p-8">
        <Header title="Bem-vindo ao FlyControl" subtitle="Conecte ou cadastre sua primeira pizzaria para começar." />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Nova Pizzaria</h2>
            <NewPizzeriaCard onCreate={createPizzeria} mode="new" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Conectar Pizzaria Existente</h2>
            <p className="text-sm text-muted-foreground">Vincule uma pizzaria que já possui uma API Key no SiteCreatorFly.</p>
            <NewPizzeriaCard onCreate={createPizzeria} mode="connect" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {pizzerias.length > 1 && (
            <select className="rounded-md border border-input bg-card px-3 py-2 text-sm"
              value={activeId ?? ""} onChange={(e) => setActiveId(e.target.value)}>
              {pizzerias.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)}>
              <Plus className="h-4 w-4" /> Gerenciar Pizzarias
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant={soundOn ? "default" : "outline"} size="sm" onClick={() => setSoundOn((v) => !v)}>
            {soundOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Som {soundOn ? "ligado" : "desligado"}
          </Button>
        </div>
      </div>

      {showNew && (
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Nova Pizzaria</h2>
            <NewPizzeriaCard onCreate={createPizzeria} mode="new" />
          </div>
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Conectar Existente</h2>
            <NewPizzeriaCard onCreate={createPizzeria} mode="connect" />
          </div>
        </div>
      )}

      {active && isSuperAdmin && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">API Key (use no SiteCreatorFly)</div>
              <code className="mt-1 inline-block rounded bg-muted px-2 py-1 text-xs">{active.api_key}</code>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(active.api_key);
              setCopied(true); setTimeout(() => setCopied(false), 1500);
            }}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar
            </Button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Endpoint: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/orders</code>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="destructive" size="sm" className="gap-2" onClick={clearAllOrders}>
              <Trash2 className="h-4 w-4" /> Limpar Todos os Pedidos
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Apenas administradores podem zerar a gestão desta pizzaria.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ v: "ativos", l: "Em andamento" }, { v: "todos", l: "Todos" }, ...STATUSES.map(s => ({ v: s.value, l: s.label }))].map((f) => (
          <button key={f.v}
            onClick={() => setFilter(f.v)}
            className={`rounded-full border px-4 py-2 text-xs font-bold transition-all duration-200 uppercase tracking-wider ${
              filter === f.v ? "border-primary bg-primary text-primary-foreground shadow-lg scale-105" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            {f.l}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((o) => (
          <OrderCard key={o.id} o={o} onChange={changeStatus} onDelete={deleteOrder} />
        ))}
        {!filtered.length && (
          <div className="col-span-full grid place-items-center rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">
            Nenhum pedido aqui. Aguardando…
          </div>
        )}
      </div>

      <FlyStatusModal
        open={flyStatus.open}
        onOpenChange={(o) => setFlyStatus((s) => ({ ...s, open: o }))}
        kind={flyStatus.kind}
        orderNumber={flyStatus.order?.order_number ?? ""}
        customerName={flyStatus.order?.customer_name ?? ""}
        customerPhone={flyStatus.order?.customer_phone ?? ""}
        pizzeria={(active ?? null) as FlyStatusPizzeria | null}
      />
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function OrderCard({ o, onChange, onDelete }: { o: Order; onChange: (o: Order, s: string) => void; onDelete: (o: Order) => void }) {
  const status = STATUSES.find((s) => s.value === o.status) ?? STATUSES[0];
  const items = Array.isArray(o.items) ? o.items : [];
  
  const formatItemName = (it: any) => {
    if (it.name) return it.name;
    if (it.title) return it.title;
    if (it.type === "pizza" && it.flavors) {
      return `Pizza ${it.size || ""} (${it.flavors.join(" / ")})`;
    }
    if (it.type === "beverage") return it.name || "Bebida";
    return "Item";
  };

  const getItemPrice = (it: any) => {
    return it.price ?? it.total_price ?? it.unit_price ?? 0;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-lg group">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pedido</div>
          <div className="text-xl font-black text-foreground group-hover:text-primary transition-colors">#{o.order_number || o.id.substring(0, 5)}</div>
        </div>
        <Badge className={`${status.color} font-bold px-3 py-1`} variant="outline">{status.label}</Badge>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {o.customer_name.charAt(0).toUpperCase()}
          </div>
          <div className="font-bold text-foreground">{o.customer_name}</div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground bg-muted/30 p-2 rounded-lg">
          <Phone className="h-3.5 w-3.5 text-primary" /> 
          <span className="font-medium">{o.customer_phone}</span>
        </div>
        {o.customer_address && (
          <div className="flex items-start gap-2 text-muted-foreground leading-relaxed">
            <MapPin className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> 
            <span className="text-xs">{o.customer_address}{o.neighborhood ? ` — ${o.neighborhood}` : ""}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> {new Date(o.created_at).toLocaleTimeString("pt-BR")}
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        {items.slice(0, 6).map((it: any, i: number) => (
          <li key={i} className="flex flex-col gap-0.5 mb-2 last:mb-0">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{it.qty ?? it.quantity ?? 1}× {formatItemName(it)}</span>
              <span className="text-muted-foreground whitespace-nowrap">R$ {Number(getItemPrice(it)).toFixed(2)}</span>
            </div>
            {it.notes && <div className="text-[11px] text-muted-foreground italic pl-4">Obs: {it.notes}</div>}
          </li>
        ))}
        {items.length > 6 && <li className="text-xs text-muted-foreground">+{items.length - 6} itens</li>}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="text-lg font-bold text-primary">R$ {Number(o.total).toFixed(2)}</span>
      </div>
      {o.notes && (
        <div className="mt-2 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
          <strong>Obs Geral:</strong> {o.notes}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <select className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          value={o.status} onChange={(e) => onChange(o, e.target.value)}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <a href={`/print/${o.id}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline"><Printer className="h-4 w-4" /> Imprimir</Button>
        </a>
        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive/20" onClick={() => onDelete(o)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function NewPizzeriaCard({ onCreate, mode = "new" }: { onCreate: (f: any) => void; mode?: "new" | "connect" }) {
  const [f, setF] = useState({ name: "", slug: "", phone: "", address: "", api_key: "" });
  const isConnect = mode === "connect";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCreate(f); }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <input 
        className="rounded-md border border-input bg-background px-3 py-2 text-sm" 
        placeholder="Nome da pizzaria" 
        required 
        value={f.name} 
        onChange={(e) => setF({ ...f, name: e.target.value })} 
      />
      
      <input 
        className="rounded-md border border-input bg-background px-3 py-2 text-sm" 
        placeholder="Slug (ex: minha-pizza)" 
        required={!isConnect}
        value={f.slug} 
        onChange={(e) => setF({ ...f, slug: e.target.value })} 
      />

      {isConnect ? (
        <input 
          className="rounded-md border border-input bg-primary/20 border-primary/50 bg-background px-3 py-2 text-sm font-mono" 
          placeholder="Cole aqui a API Key Externa" 
          required
          value={f.api_key || ""} 
          onChange={(e) => setF({ ...f, api_key: e.target.value })} 
        />
      ) : (
        <>
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Endereço" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </>
      )}

      <Button type="submit" variant={isConnect ? "secondary" : "default"}>
        {isConnect ? "Conectar Pizzaria" : "Criar nova pizzaria"}
      </Button>
    </form>
  );
}

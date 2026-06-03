import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Plug, Plus, Play, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlyStatusSettings } from "@/components/flystatus/FlyStatusSettings";
import { FiqonSettings } from "@/components/pizzerias/FiqonSettings";
import { PizzeriaPromotion } from "@/components/pizzerias/PizzeriaPromotion";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{value}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function AddPizzeriaDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const apiKey = fd.get("apiKey") as string;
    
    // Buscar se já existe
    const { data: existing, error: searchError } = await supabase
      .from("pizzerias")
      .select("*")
      .or(`api_key.eq.${apiKey}`)
      .maybeSingle();

    if (searchError) {
      toast.error("Erro ao buscar: " + searchError.message);
      setLoading(true);
      return;
    }

    if (existing) {
      if (existing.owner_id && existing.owner_id !== user?.id) {
        toast.error("Esta pizzaria já possui um dono.");
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("pizzerias")
        .update({ owner_id: user?.id, status: "active" })
        .eq("id", existing.id);

      if (updateError) {
        toast.error("Erro ao conectar: " + updateError.message);
      } else {
        toast.success("Pizzaria sincronizada com sucesso!");
        setOpen(false);
        onSuccess();
      }
    } else {
      toast.error("Pizzaria não encontrada com esta API Key no sistema.");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar Pizzaria Existente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular Pizzaria do SiteCreatorFly</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Pizzaria</Label>
            <Input id="name" name="name" placeholder="Ex: Pizzaria do João" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (do SiteCreatorFly)</Label>
            <Input id="apiKey" name="apiKey" placeholder="Cole a chave aqui" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Vincular Pizzaria"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Settings() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzerias, setPizzerias] = useState<any[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [origin, setOrigin] = useState("");

  const loadPizzerias = async () => {
    let query = supabase.from("pizzerias").select("*").neq("status", "deleted").order("created_at");
    
    // Se não for super admin, filtra apenas as pizzarias do dono
    if (!isSuperAdmin && user?.id) {
      query = query.eq("owner_id", user.id);
    }
    
    const { data } = await query;
    setPizzerias(data ?? []);
  };

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (user) loadPizzerias();
  }, [user]);

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("pizzerias").update(patch).eq("id", id);
    if (error) toast.error(error.message); else {
      toast.success("Salvo");
      loadPizzerias();
    }
  }

  async function testOrder(p: any) {
    setTesting(p.id);
    setTestResult(null);
    try {
      const payload = {
        event: "order.created",
        pizzeria: { slug: p.slug },
        customer: {
          name: "Cliente Teste Lovable",
          phone: "(11) 99999-9999",
          address: "Rua do Teste, 123",
          neighborhood: "Centro"
        },
        order: {
          id: "test-" + Date.now(),
          total: 89.90,
          payment_method: "Pix",
          items: [
            { name: "Pizza Grande Teste", quantity: 1, price: 89.90 }
          ],
          notes: "Este é um pedido de teste enviado pelo painel."
        },
        source: "flycontrol-test"
      };

      const res = await fetch(`${origin}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": p.api_key
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setTestResult({
        status: res.status,
        ok: res.ok,
        data
      });

      if (res.ok) {
        toast.success("Pedido de teste enviado com sucesso!");
      } else {
        toast.error("Erro no teste: " + (data.error || "Erro desconhecido"));
      }
    } catch (err: any) {
      console.error(err);
      setTestResult({
        status: "ERRO",
        ok: false,
        error: err.message
      });
      toast.error("Falha na conexão: " + err.message);
    } finally {
      setTesting(null);
    }
  }

  const baseUrl = origin;
  const createEndpoint = `${origin}/api/pizzerias/create`;
  const ordersEndpoint = `${origin}/api/orders`;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Configurações</h1>
        <AddPizzeriaDialog onSuccess={loadPizzerias} />
      </div>

      {/* Painel de integração com SiteCreatorFly */}
      <div className="mb-8 rounded-xl border border-primary/30 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Integração com SiteCreatorFly</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Utilize os campos abaixo para configurar a integração no painel do SiteCreatorFly:
            </p>
            <CopyField label="URL base do FLYCONTROL" value={baseUrl} />
            <CopyField label="Endpoint de Criação Automática" value={createEndpoint} />
            <CopyField label="Endpoint de Envio de Pedidos" value={ordersEndpoint} />
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Como conectar uma pizzaria existente</div>
            1. No SiteCreatorFly, copie a <strong>API Key</strong> da pizzaria.<br />
            2. Aqui no FlyControl, clique no botão <strong>"Adicionar Pizzaria Existente"</strong> acima.<br />
            3. Cole a API Key e dê um nome para identificá-la.<br />
            4. No SiteCreatorFly, certifique-se de que a <strong>URL base</strong> aponta para o endereço acima.
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-xl font-semibold">Suas pizzarias</h2>
      <div className="space-y-6">
        {pizzerias.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div>
                <div className="font-bold text-lg">{p.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">ID: {p.id}</div>
              </div>
              <Badge variant={p.status === "active" ? "default" : "secondary"}>
                {p.status === "active" ? "Ativo" : "Pausado"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <span>Som ao receber pedido</span>
                <input type="checkbox" defaultChecked={p.sound_enabled}
                  onChange={(e) => update(p.id, { sound_enabled: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <span>Status do estabelecimento</span>
                <select defaultValue={p.status} className="rounded bg-background px-2 py-1"
                  onChange={(e) => update(p.id, { status: e.target.value })}>
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                </select>
              </label>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase text-muted-foreground">Descrição da Pizzaria</Label>
                <textarea 
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Conte um pouco sobre a sua pizzaria..."
                  defaultValue={p.description || ""}
                  onBlur={(e) => update(p.id, { description: e.target.value })}
                />
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase text-muted-foreground">Taxa de Entrega (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    defaultValue={p.delivery_fee || 0}
                    onBlur={(e) => update(p.id, { delivery_fee: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase text-muted-foreground">Horários de Funcionamento</Label>
                  <Input 
                    placeholder="Ex: Seg a Sex: 18h às 23h" 
                    defaultValue={typeof p.opening_hours === 'string' ? p.opening_hours : JSON.stringify(p.opening_hours)}
                    onBlur={(e) => {
                      let val = e.target.value;
                      try {
                        // Tentar parsear se for JSON, senão salvar como string/array simples
                        if (val.startsWith('[') || val.startsWith('{')) {
                          update(p.id, { opening_hours: JSON.parse(val) });
                        } else {
                          update(p.id, { opening_hours: val });
                        }
                      } catch {
                        update(p.id, { opening_hours: val });
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase text-muted-foreground">Endpoint de sincronização do SiteCreatorFly</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    placeholder="https://watjejwgtieqfkpebkfz.supabase.co/functions/v1/menu-sync" 

                    defaultValue={p.sync_endpoint || ""}
                    onBlur={(e) => update(p.id, { sync_endpoint: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  URL da Edge Function que fornece os dados do cardápio para sincronização.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">API Key Principal</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={async () => {
                  const apiKey = "fc_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map((b) => b.toString(16).padStart(2, "0")).join("");
                  await update(p.id, { api_key: apiKey });
                }}>Redefinir</Button>
              </div>
              <div className="flex items-center gap-2">
                <Input value={p.api_key} readOnly className="h-9 bg-muted text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(p.api_key);
                    toast.success("Chave copiada");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  Teste de Recebimento
                </h3>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => testOrder(p)}
                  disabled={testing === p.id}
                  className="gap-2"
                >
                  {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Enviar Pedido Teste
                </Button>
              </div>

              {testResult && testing === null && pizzerias.find(x => x.id === p.id) && (
                <div className={`rounded-md p-3 text-xs font-mono overflow-auto max-h-40 ${testResult.ok ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>
                  <div className="font-bold mb-1">Status: {testResult.status}</div>
                  <pre>{JSON.stringify(testResult.data || testResult.error, null, 2)}</pre>
                </div>
              )}
              
              <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3" />
                O pedido teste aparecerá no Dashboard se for bem-sucedido.
              </div>
            </div>

            <FlyStatusSettings
              pizzeria={p}
              onUpdated={(patch) => setPizzerias((prev) => prev.map((x) => x.id === p.id ? { ...x, ...patch } : x))}
            />
            <FiqonSettings
              pizzeria={p}
              onUpdated={(patch) => setPizzerias((prev) => prev.map((x) => x.id === p.id ? { ...x, ...patch } : x))}
            />
            <PizzeriaPromotion pizzeria={p} />
          </div>
        ))}
        {!pizzerias.length && <div className="text-sm text-muted-foreground">Nenhuma pizzaria cadastrada.</div>}
      </div>
    </div>
  );
}

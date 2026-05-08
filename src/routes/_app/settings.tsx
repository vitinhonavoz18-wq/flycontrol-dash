import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Plug } from "lucide-react";

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

function Settings() {
  const { user } = useAuth();
  const [pz, setPz] = useState<any[]>([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => { (async () => {
    const { data } = await supabase.from("pizzerias").select("*").order("created_at");
    setPz(data ?? []);
  })(); }, [user]);

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("pizzerias").update(patch).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Salvo");
  }

  const baseUrl = origin;
  const pizzeriasCreate = `${origin}/api/pizzerias/create`;
  const ordersEndpoint = `${origin}/api/orders`;

  return (
    <div className="p-6 md:p-8">
      <h1 className="mb-6 text-3xl font-bold">Configurações</h1>

      {/* Painel de integração com SiteCreatorFly */}
      <div className="mb-8 rounded-xl border border-primary/30 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Integração com SiteCreatorFly</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Cole estes valores nos campos correspondentes do painel do SiteCreatorFly para conectar
          os sites de delivery a este FlyControl.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <CopyField label="URL base do FLYCONTROL" value={baseUrl} />
          <CopyField label="URL final de envio de pedidos (opcional)" value={ordersEndpoint} />
          <CopyField label="Endpoint de registro (derivado)" value={pizzeriasCreate} />
          <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Como usar</div>
            1. No SiteCreatorFly, ative <em>“Ativar envio para FLYCONTROL”</em>.<br />
            2. Cole a <strong>URL base</strong> acima no campo correspondente.<br />
            3. Clique em <em>“Registrar pizzaria no FLYCONTROL”</em> — a API Key será gerada e
            preenchida automaticamente.<br />
            4. (Opcional) Sobrescreva a URL final de envio com o valor acima.
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-xl font-semibold">Suas pizzarias</h2>
      <div className="space-y-4">
        {pz.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="font-semibold">{p.name}</div>
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
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CopyField label="API Key desta pizzaria" value={p.api_key} />
              <CopyField label="Slug" value={p.slug} />
            </div>
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={async () => {
                const apiKey = "fc_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
                  .map((b) => b.toString(16).padStart(2, "0")).join("");
                await update(p.id, { api_key: apiKey });
                setPz((prev) => prev.map((x) => x.id === p.id ? { ...x, api_key: apiKey } : x));
              }}>Gerar nova API key</Button>
            </div>
          </div>
        ))}
        {!pz.length && <div className="text-sm text-muted-foreground">Nenhuma pizzaria cadastrada.</div>}
      </div>
    </div>
  );
}

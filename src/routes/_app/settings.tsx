import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const { user } = useAuth();
  const [pz, setPz] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const { data } = await supabase.from("pizzerias").select("*").order("created_at");
    setPz(data ?? []);
  })(); }, [user]);

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("pizzerias").update(patch).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Salvo");
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="mb-6 text-3xl font-bold">Configurações</h1>
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
            <div className="mt-3 text-xs text-muted-foreground">
              API Key: <code className="rounded bg-muted px-1 py-0.5">{p.api_key}</code>
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

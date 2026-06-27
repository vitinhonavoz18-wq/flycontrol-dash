import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, UtensilsCrossed, UserCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getWaiterSession, clearWaiterSession } from "@/lib/waiterSession";
import { claimTableSession } from "@/lib/waiterAuth.functions";

export const Route = createFileRoute("/waiter-portal")({ component: WaiterPortal });

type SessRow = {
  id: string;
  table_number: string;
  table_name: string | null;
  total_amount: number;
  subtotal_amount: number;
  opened_at: string;
  waiter_id: string | null;
  waiter?: { full_name: string } | null;
};

function WaiterPortal() {
  const nav = useNavigate();
  const claim = useServerFn(claimTableSession);
  const [sess, setSess] = useState(() => getWaiterSession());
  const [rows, setRows] = useState<SessRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = getWaiterSession();
    if (!s) {
      nav({ to: "/waiter-login" });
      return;
    }
    setSess(s);
  }, [nav]);

  async function load() {
    if (!sess) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("table_sessions")
      .select("id, table_number, table_name, total_amount, subtotal_amount, opened_at, waiter_id, waiters(full_name)")
      .eq("restaurant_id", sess.waiter.tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as any[])?.map((r) => ({ ...r, waiter: r.waiters })) ?? []);
    setLoading(false);
  }

  useEffect(() => { if (sess) load(); /* eslint-disable-next-line */ }, [sess]);

  async function handleClaim(sessionId: string) {
    if (!sess) return;
    try {
      await claim({ data: { token: sess.token, sessionId } });
      toast.success("Comanda atribuída a você");
      load();
    } catch (e: any) {
      toast.error(e.message || "Falha ao reivindicar");
    }
  }

  function logout() {
    clearWaiterSession();
    nav({ to: "/waiter-login" });
  }

  if (!sess) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center">
              <UtensilsCrossed className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Portal do Garçom</h1>
              <p className="text-sm text-muted-foreground">{sess.waiter.fullName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comandas abertas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 grid place-items-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Nenhuma comanda aberta no momento.</div>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => {
                  const mine = r.waiter_id === sess.waiter.id;
                  const other = r.waiter_id && !mine;
                  return (
                    <li key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-0.5">
                        <div className="font-semibold">{r.table_name || `Mesa ${r.table_number}`}</div>
                        <div className="text-xs text-muted-foreground">
                          Aberta {new Date(r.opened_at).toLocaleTimeString("pt-BR")}
                          {r.waiter?.full_name && <> · Atendido por <b>{r.waiter.full_name}</b></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">
                          {Number(r.total_amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                        {mine ? (
                          <Badge className="bg-primary/15 text-primary">Sua comanda</Badge>
                        ) : (
                          <Button size="sm" variant={other ? "outline" : "default"} onClick={() => handleClaim(r.id)}>
                            <UserCheck className="h-4 w-4 mr-1" />
                            {other ? "Assumir" : "Reivindicar"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Para lançar pedidos e fechar comandas, utilize o aplicativo de sala (SiteCreatorFly) ou o terminal da loja.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Printer, X, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export type CloseRequest = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  table_number: string;
  session_id: string | null;
  customer_name: string | null;
  status: string;
  requested_at: string;
};

type SessionInfo = {
  id: string;
  opened_at: string;
  total_amount: number;
  subtotal_amount: number;
  service_fee_amount: number;
  service_fee_enabled: boolean;
  service_fee_percent: number;
  customer_name: string | null;
  order_count: number;
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
function fmtTime(iso?: string) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function durationLabel(openedAt?: string) {
  if (!openedAt) return "--";
  const ms = Date.now() - new Date(openedAt).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

export function TableCloseRequestPopup({
  queue,
  onDismiss,
  onProcessed,
}: {
  queue: CloseRequest[];
  onDismiss: (id: string) => void;
  onProcessed: (id: string) => void;
}) {
  const current = queue[0];
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSession(null);
      if (!current?.session_id) return;
      const { data, error } = await supabase
        .from("table_sessions")
        .select("id, opened_at, total_amount, subtotal_amount, service_fee_amount, service_fee_enabled, service_fee_percent, customer_name, table_session_orders(count)")
        .eq("id", current.session_id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const d: any = data;
      setSession({
        id: d.id,
        opened_at: d.opened_at,
        total_amount: Number(d.total_amount || 0),
        subtotal_amount: Number(d.subtotal_amount || 0),
        service_fee_amount: Number(d.service_fee_amount || 0),
        service_fee_enabled: !!d.service_fee_enabled,
        service_fee_percent: Number(d.service_fee_percent || 10),
        customer_name: d.customer_name,
        order_count: d.table_session_orders?.[0]?.count || 0,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.session_id]);

  // NOTE: no auto "viewed" marker. The popup must NOT mutate
  // table_close_requests.status on open — only two legal transitions exist:
  // customer creates 'pending'; operator "Finalizar Mesa" sets 'completed'
  // via closeTableWorkflow. Any other UPDATE is forbidden by design.

  const customerName = useMemo(
    () => current?.customer_name || session?.customer_name || null,
    [current, session]
  );

  if (!current) return null;

  function handlePrintPreview() {
    if (!current.session_id) {
      toast.error("Sessão não encontrada para impressão.");
      return;
    }
    // Print ONLY. No status mutation. No queue mutation. No closeTableWorkflow.
    // Mesa permanece aberta; popup permanece visível para o operador finalizar.
    window.open(`/print/session-${current.session_id}`, "_blank", "width=420,height=680");
    toast.success("Pré-conta enviada para impressão. Mesa permanece aberta.");
  }

  async function handleCloseTable() {
    if (!current.session_id) {
      toast.error("Nenhuma sessão aberta vinculada.");
      return;
    }
    setBusy(true);
    try {
      const { closeTableWorkflow } = await import("@/lib/closeTableWorkflow");
      const res = await closeTableWorkflow({
        sessionId: current.session_id,
        tableNumber: current.table_number,
        restaurantId: current.restaurant_id,
        requestId: current.id,
      });
      if (!res.sessionClosed) {
        toast.error("Erro ao fechar mesa: " + (res.error || "desconhecido"));
        return;
      }
      toast.success(`Mesa ${current.table_number} fechada.`);
      onProcessed(current.id);
    } catch (e: any) {
      toast.error("Erro ao fechar mesa: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    onDismiss(current.id);
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border-2 border-orange-500/60 bg-card shadow-2xl shadow-orange-500/20 overflow-hidden animate-in zoom-in-95">
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-bold text-lg tracking-wide">CLIENTE FECHOU A MESA</span>
          </div>
          {queue.length > 1 && (
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              +{queue.length - 1} na fila
            </Badge>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">
              Mesa <span className="font-bold text-foreground">{current.table_number}</span> está solicitando o fechamento da conta.
            </div>
            {customerName && (
              <div className="mt-1 text-sm">
                Cliente: <span className="font-medium">{customerName}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total Atual" value={fmtCurrency(session?.total_amount ?? 0)} highlight />
            <Stat label="Pedidos" value={String(session?.order_count ?? 0)} />
            <Stat label="Aberta às" value={fmtTime(session?.opened_at)} />
            <Stat label="Solicitado às" value={fmtTime(current.requested_at)} />
            <Stat label="Duração" value={durationLabel(session?.opened_at)} className="col-span-2" />
          </div>

          {session && session.subtotal_amount > 0 && (
            <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(session.subtotal_amount)}</span></div>
              {session.service_fee_enabled && (
                <div className="flex justify-between">
                  <span>Taxa {session.service_fee_percent}%</span>
                  <span>{fmtCurrency(session.service_fee_amount)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handlePrintPreview}
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Printer className="h-4 w-4 mr-2" /> IMPRIMIR COMANDA
            </Button>
            <Button
              onClick={handleCloseTable}
              disabled={busy}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> FINALIZAR MESA
            </Button>
            <Button
              onClick={handleDismiss}
              disabled={busy}
              variant="outline"
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" /> FECHAR POPUP {queue.length > 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, className }: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`rounded-lg border bg-muted/30 px-3 py-2 ${className || ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${highlight ? "text-orange-500 text-lg" : "text-foreground text-sm"}`}>{value}</div>
    </div>
  );
}

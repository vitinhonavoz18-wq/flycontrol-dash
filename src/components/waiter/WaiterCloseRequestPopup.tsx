import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";

/**
 * PASSIVE waiter popup shown when a customer requests to close their table.
 * Purely informational — DOES NOT mutate table_close_requests, table_sessions,
 * or trigger closeTableWorkflow / notifyTableClosed. Clicking OK just closes it.
 * The administrator remains the sole party responsible for finalizing the table.
 */

export type WaiterCloseAlert = {
  requestId: string;
  sessionId: string;
  tableNumber: string;
  tableName: string | null;
  customerName: string | null;
  requestedAt: string;
  waiterName: string;
  notes: string | null;
};

type Details = {
  total: number;
  subtotal: number;
  itemCount: number;
  orders: { id: string; number: string | null; items: { name: string; qty: number }[]; total: number }[];
};

function fmtBRL(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WaiterCloseRequestPopup({
  alert,
  onDismiss,
}: {
  alert: WaiterCloseAlert;
  onDismiss: () => void;
}) {
  const [details, setDetails] = useState<Details | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sess } = await supabase
        .from("table_sessions")
        .select("total_amount, subtotal_amount")
        .eq("id", alert.sessionId)
        .maybeSingle();
      const { data: links } = await supabase
        .from("table_session_orders")
        .select("order_id")
        .eq("table_session_id", alert.sessionId);
      const orderIds = (links || []).map((l: any) => l.order_id);
      let ordersOut: Details["orders"] = [];
      let itemCount = 0;
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, items, total")
          .in("id", orderIds);
        (orders || []).forEach((o: any) => {
          const items = Array.isArray(o.items) ? o.items : [];
          const mapped = items.map((it: any) => ({
            name: it.name || it.product_name || it.title || "Item",
            qty: Number(it.qty ?? it.quantity ?? 1),
          }));
          itemCount += mapped.reduce((s: number, x: { qty: number }) => s + x.qty, 0);
          ordersOut.push({
            id: o.id,
            number: o.order_number ? String(o.order_number) : null,
            items: mapped,
            total: Number(o.total || 0),
          });
        });
      }
      if (cancelled) return;
      setDetails({
        total: Number(sess?.total_amount || 0),
        subtotal: Number(sess?.subtotal_amount || 0),
        itemCount,
        orders: ordersOut,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [alert.sessionId]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-orange-500/60 bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 flex items-center gap-2 text-white">
          <Bell className="h-5 w-5" />
          <span className="font-bold text-base tracking-wide">CLIENTE PEDIU PARA FECHAR A MESA</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase">Mesa</div>
            <div className="text-3xl font-black text-foreground">
              {alert.tableName || `Mesa ${alert.tableNumber}`}
            </div>
            <div className="text-xs text-muted-foreground">Nº {alert.tableNumber}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="Garçom" value={alert.waiterName} />
            <Info label="Solicitado" value={fmtTime(alert.requestedAt)} />
            {alert.customerName && <Info label="Cliente" value={alert.customerName} className="col-span-2" />}
            <Info label="Valor parcial" value={fmtBRL(details?.total ?? 0)} highlight />
            <Info label="Itens" value={String(details?.itemCount ?? 0)} />
          </div>

          {details && details.orders.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Pedidos</div>
              <ul className="space-y-1.5 max-h-40 overflow-auto text-xs">
                {details.orders.map((o) => (
                  <li key={o.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                    <div className="flex justify-between font-semibold">
                      <span>#{o.number || o.id.slice(0, 6)}</span>
                      <span>{fmtBRL(o.total)}</span>
                    </div>
                    <ul className="mt-0.5 text-muted-foreground">
                      {o.items.slice(0, 5).map((it, i) => (
                        <li key={i}>{it.qty}× {it.name}</li>
                      ))}
                      {o.items.length > 5 && <li className="italic">+{o.items.length - 5} itens…</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alert.notes && (
            <div className="border-t pt-3">
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Observações</div>
              <div className="text-sm">{alert.notes}</div>
            </div>
          )}

          <Button onClick={onDismiss} size="lg" className="w-full h-12 bg-primary text-primary-foreground">
            <X className="h-4 w-4 mr-2" /> OK
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            Este aviso é apenas informativo. O administrador finaliza a mesa.
          </p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, highlight, className }: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`rounded-lg border bg-muted/30 px-3 py-2 ${className || ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${highlight ? "text-orange-500 text-lg" : "text-foreground text-sm"}`}>{value}</div>
    </div>
  );
}

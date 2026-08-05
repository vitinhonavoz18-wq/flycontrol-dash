import { Loader2, MapPin, Phone, Printer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Order, OrderItem } from "@/types/order";
import { formatItemName, getItemPrice, normalizeOrderType } from "@/utils/order-utils";
import { OrderTimer } from "./OrderTimer";
import {
  countItems,
  formatBRL,
  formatPaymentMethod,
  formatPaymentStatus,
  formatReceivedAt,
  formatSource,
  getOrderTypeLabel,
} from "./orderDisplay";
import {
  ORDER_COLUMNS,
  canMoveOrder,
  getStatusLabel,
  type KanbanStatus,
} from "./orderStatusConfig";

export type OrderDetailsDrawerProps = {
  order: Order | null;
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  canDelete: boolean;
  onMove: (order: Order, status: KanbanStatus) => void;
  onDelete: (order: Order) => void;
};

/**
 * Detalhes completos do pedido.
 *
 * Além de mostrar os itens, oferece os botões de mudança de etapa: essa é a
 * via de acesso para quem usa teclado ou celular, onde arrastar entre colunas
 * é impraticável. Os botões passam pelo mesmo `onMove` do arraste, então as
 * regras e o histórico são idênticos.
 */
export function OrderDetailsDrawer({
  order,
  now,
  open,
  onOpenChange,
  isPending,
  canDelete,
  onMove,
  onDelete,
}: OrderDetailsDrawerProps) {
  if (!order) return null;

  const items: OrderItem[] = Array.isArray(order.items) ? (order.items as OrderItem[]) : [];
  const orderType = normalizeOrderType(order);
  const paymentStatus = formatPaymentStatus(order.payment_status);
  const source = formatSource(order.source);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-xl font-black">
            Pedido #{order.order_number || order.id.slice(0, 5)}
            <Badge variant="outline" className="text-[10px] font-bold">
              {getStatusLabel(order.status)}
            </Badge>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Recebido às {formatReceivedAt(order.created_at)}</span>
            <OrderTimer createdAt={order.created_at} now={now} />
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5 text-sm">
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cliente
            </h4>
            <p className="font-bold text-foreground">{order.customer_name}</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              {order.customer_phone}
            </p>
            {orderType === "delivery" && order.customer_address && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {order.customer_address}
                  {order.neighborhood ? ` — ${order.neighborhood}` : ""}
                </span>
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Itens ({countItems(order.items)})
            </h4>
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={index} className="space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {item.qty ?? item.quantity ?? 1}× {formatItemName(item)}
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {formatBRL(getItemPrice(item))}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="pl-4 text-[11px] italic text-muted-foreground">
                      Obs: {item.notes}
                    </p>
                  )}
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhum item registrado.</li>
              )}
            </ul>
          </section>

          <section className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <Row label="Tipo" value={getOrderTypeLabel(order)} />
            <Row label="Pagamento" value={formatPaymentMethod(order.payment_method)} />
            {paymentStatus && <Row label="Situação do pagamento" value={paymentStatus} />}
            {source && <Row label="Origem" value={source} />}
            {order.delivery_fee > 0 && (
              <Row label="Taxa de entrega" value={formatBRL(order.delivery_fee)} />
            )}
            <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm">
              <span className="font-bold">Total</span>
              <span className="font-black text-primary">{formatBRL(order.total)}</span>
            </div>
          </section>

          {order.notes && (
            <section className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Observações: </strong>
              {order.notes}
            </section>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Mover para
            </h4>
            <div className="flex flex-wrap gap-2">
              {ORDER_COLUMNS.map((column) => {
                const check = canMoveOrder(order.status, column.id);
                return (
                  <Button
                    key={column.id}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={!check.allowed || isPending}
                    title={check.allowed ? undefined : check.reason}
                    onClick={() => onMove(order, column.id)}
                  >
                    {isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    {column.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-wrap gap-2 border-t border-border pt-4">
            <a href={`/print/${order.id}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
              </Button>
            </a>
            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/20 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  onDelete(order);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
              </Button>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

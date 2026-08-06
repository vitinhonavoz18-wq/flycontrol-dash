import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Bike, GripVertical, Loader2, MapPin, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Order } from "@/types/order";
import { normalizeOrderType } from "@/utils/order-utils";
import { OrderTimer } from "./OrderTimer";
import {
  countItems,
  formatBRL,
  formatPaymentMethod,
  formatPaymentStatus,
  formatReceivedAt,
  formatShortLocation,
  formatSource,
  getOrderTypeLabel,
  isPaid,
} from "./orderDisplay";
import { getDelayLevel, getStatusLabel } from "./orderStatusConfig";

const TYPE_BADGE_STYLES: Record<string, string> = {
  delivery: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pickup: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  table: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

export type OrderCardContentProps = {
  order: Order;
  now: number;
  isRecentNew?: boolean;
  waiterName?: string | null;
};

/**
 * Conteúdo visual do card, sem nenhuma ação e sem lógica de arraste — por isso
 * pode ser reaproveitado tal e qual dentro do fantasma que segue o cursor.
 */
export function OrderCardContent({
  order,
  now,
  isRecentNew = false,
  waiterName,
}: OrderCardContentProps) {
  const orderType = normalizeOrderType(order);
  const delayLevel = getDelayLevel(order.created_at, now);
  const paymentStatus = formatPaymentStatus(order.payment_status);
  const source = formatSource(order.source);
  const itemCount = countItems(order.items);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-black leading-none text-foreground">
              #{order.order_number || order.id.slice(0, 5)}
            </span>
            <Badge
              variant="outline"
              className={`h-5 py-0 text-[9px] font-black ${TYPE_BADGE_STYLES[orderType]}`}
            >
              {getOrderTypeLabel(order).toUpperCase()}
            </Badge>
            {isRecentNew && (
              <Badge className="h-5 animate-pulse bg-primary py-0 text-[9px] font-black text-white">
                NOVO
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>Recebido às {formatReceivedAt(order.created_at)}</span>
            <OrderTimer createdAt={order.created_at} now={now} />
          </div>
        </div>

        {delayLevel === "late" && (
          <Badge
            variant="outline"
            className="shrink-0 border-rose-500/30 bg-rose-500/15 py-0 text-[9px] font-black text-rose-600 dark:text-rose-400"
          >
            ATRASADO
          </Badge>
        )}
      </div>

      <div className="space-y-0.5">
        <p className="truncate text-sm font-bold text-foreground">{order.customer_name}</p>
        <p className="text-xs text-muted-foreground">
          {itemCount} {itemCount === 1 ? "item" : "itens"} ·{" "}
          <span className="font-bold text-primary">{formatBRL(order.total)}</span>
        </p>
      </div>

      <dl className="space-y-1 border-t border-border/60 pt-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Pagamento</dt>
          <dd className="flex items-center gap-1.5 truncate font-medium text-foreground">
            {formatPaymentMethod(order.payment_method)}
            {paymentStatus && (
              <Badge
                variant="outline"
                className={`h-4 py-0 text-[9px] font-bold ${
                  isPaid(order.payment_status)
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {paymentStatus}
              </Badge>
            )}
          </dd>
        </div>

        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">Entrega</dt>
          <dd className="flex min-w-0 items-center gap-1 text-right font-medium text-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{formatShortLocation(order)}</span>
          </dd>
        </div>

        {source && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Origem</dt>
            <dd className="truncate font-medium text-foreground">{source}</dd>
          </div>
        )}

        {waiterName && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Responsável</dt>
            <dd className="flex items-center gap-1 truncate font-medium text-foreground">
              <Bike className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              {waiterName}
            </dd>
          </div>
        )}
      </dl>

      {order.notes && (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-[11px] leading-snug text-muted-foreground">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{order.notes}</span>
        </p>
      )}
    </div>
  );
}

export type OrderKanbanCardProps = OrderCardContentProps & {
  isPending?: boolean;
  onOpenDetails?: (order: Order) => void;
};

/**
 * Card arrastável de uma coluna.
 *
 * A área arrastável e o botão "Ver detalhes" são irmãos, e não aninhados: o
 * dnd-kit marca o elemento arrastável como `role="button"`, e um botão dentro
 * de outro botão é HTML inválido e confunde leitores de tela.
 */
export function OrderKanbanCard({
  isPending = false,
  onOpenDetails,
  ...contentProps
}: OrderKanbanCardProps) {
  const { order, isRecentNew = false } = contentProps;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { status: order.status },
    disabled: isPending,
  });

  return (
    <div
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`relative rounded-xl border bg-card shadow-sm transition-shadow ${
        isDragging ? "opacity-40" : "hover:border-primary/50 hover:shadow-md"
      } ${isRecentNew ? "border-primary shadow-[0_0_12px_rgba(255,122,0,0.25)]" : "border-border"}`}
    >
      {isPending && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-background/60 backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Atualizando pedido…</span>
        </div>
      )}

      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Pedido ${order.order_number || order.id.slice(0, 5)} de ${order.customer_name}, etapa ${getStatusLabel(order.status)}`}
        aria-busy={isPending}
        // `touch-manipulation` (e não `touch-none`): a rolagem do dedo continua
        // funcionando, e o arraste só começa depois do toque longo configurado
        // no TouchSensor.
        className={`relative touch-manipulation rounded-t-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          isPending ? "cursor-progress" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <GripVertical
          className="absolute right-1 top-3 h-4 w-4 text-muted-foreground/30"
          aria-hidden="true"
        />
        <OrderCardContent {...contentProps} />
      </div>

      <div className="px-3 pb-3">
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full text-xs"
          disabled={isPending}
          onClick={() => onOpenDetails?.(order)}
        >
          Ver detalhes
        </Button>
      </div>
    </div>
  );
}

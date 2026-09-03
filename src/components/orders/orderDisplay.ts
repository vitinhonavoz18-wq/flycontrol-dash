/**
 * Formatação dos campos exibidos no card do Kanban.
 * Funções puras, sem React — o card só monta o que sai daqui.
 */

import type { Order, OrderItem } from "@/types/order";
import { normalizeOrderType } from "@/utils/orderUtils";

export function formatBRL(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",")}`;
}

export function formatReceivedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Soma as quantidades dos itens; um item sem quantidade conta como 1. */
export function countItems(items: Order["items"]): number {
  if (!Array.isArray(items)) return 0;
  return (items as OrderItem[]).reduce((total, item) => {
    const qty = Number(item?.qty ?? item?.quantity ?? 1);
    return total + (Number.isFinite(qty) && qty > 0 ? qty : 1);
  }, 0);
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Retirada no local",
  table: "Consumo no local",
};

export function getOrderTypeLabel(order: Order): string {
  return ORDER_TYPE_LABELS[normalizeOrderType(order)] ?? "Delivery";
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  cash: "Dinheiro",
  credito: "Crédito",
  credit: "Crédito",
  cartao_credito: "Cartão de crédito",
  debito: "Débito",
  debit: "Débito",
  cartao_debito: "Cartão de débito",
  cartao: "Cartão",
  card: "Cartão",
  online: "Pago online",
};

export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "Não informado";
  const key = method.trim().toLowerCase();
  return PAYMENT_LABELS[key] ?? method;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  pago: "Pago",
  pending: "A receber",
  pendente: "A receber",
  unpaid: "A receber",
  refunded: "Estornado",
  failed: "Falhou",
};

export function formatPaymentStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const key = status.trim().toLowerCase();
  return PAYMENT_STATUS_LABELS[key] ?? status;
}

/** `true` quando o pagamento já foi confirmado. */
export function isPaid(status: string | null | undefined): boolean {
  if (!status) return false;
  const key = status.trim().toLowerCase();
  return key === "paid" || key === "pago";
}

const SOURCE_LABELS: Record<string, string> = {
  // Pedido vindo do aplicativo FlyDelivery. Sem esta linha o painel mostraria
  // o código cru "flydelivery" para quem está atendendo.
  flydelivery: "FlyDelivery",
  sitecreatorfly: "Site",
  site: "Site",
  whatsapp: "WhatsApp",
  ifood: "iFood",
  instagram: "Instagram",
  manual: "Pedido manual",
  dashboard: "Pedido manual",
  waiter: "Garçom",
  qrcode: "QR Code da mesa",
};

export function formatSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const key = source.trim().toLowerCase();
  return SOURCE_LABELS[key] ?? source;
}

/**
 * Endereço curto para o card: rua e bairro, sem complemento nem referência.
 * Para retirada e mesa devolve a indicação equivalente.
 */
export function formatShortLocation(order: Order): string {
  const type = normalizeOrderType(order);

  if (type === "pickup") {
    return order.ticket_number ? `Retirada · Ficha ${order.ticket_number}` : "Retirada no balcão";
  }

  if (type === "table") {
    const table = order.table_number || order.tableNumber || order.mesa;
    return table ? `Mesa ${table}` : "Mesa não identificada";
  }

  const address = (order.customer_address ?? "").trim();
  if (!address) return "Endereço não informado";

  const firstSegment = address.split(",")[0]?.trim() || address;
  const short = firstSegment.length > 42 ? `${firstSegment.slice(0, 41)}…` : firstSegment;
  return order.neighborhood ? `${short} — ${order.neighborhood}` : short;
}

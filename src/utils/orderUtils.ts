import { OrderItem } from "@/types/order";

export const formatItemName = (it: OrderItem) => {
  if (it.product_name) return it.product_name;
  if (it.name) return it.name;
  if (it.title) return it.title;
  if (it.type === "pizza" && it.flavors) {
    return `Pizza ${it.size || ""} (${it.flavors.join(" / ")})`;
  }
  if (it.type === "beverage") return it.name || "Bebida";
  return it.nome || "Item";
};

/**
 * Preço do item, sempre como número.
 *
 * O preço chega ora como número (12.5), ora como texto ("12.50" ou "12,50"),
 * dependendo de qual versão do cardápio digital gravou o pedido. Antes, o
 * texto com vírgula ia direto para o formatador de moeda e a tela mostrava
 * "R$ NaN" — o preço sumia da conta na frente do cliente. Aqui a vírgula vira
 * ponto e o que não for número vira zero.
 */
export const getItemPrice = (it: OrderItem): number => {
  const bruto = it.total_price ?? it.price ?? it.unit_price ?? it.total ?? 0;
  const numero = typeof bruto === "string" ? Number(bruto.replace(",", ".")) : Number(bruto);
  return Number.isFinite(numero) ? numero : 0;
};

/**
 * De onde veio o pedido: mesa, retirada no balcão ou entrega.
 *
 * Aceita o pedido em qualquer formato porque cada versão do cardápio digital
 * nomeou esses campos de um jeito. Só precisa dos campos abaixo — por isso o
 * tipo lista o que ele lê, em vez de exigir o pedido inteiro.
 */
type PedidoParaClassificar = {
  order_type?: unknown;
  service_mode?: unknown;
  fulfillment_type?: unknown;
  delivery_type?: unknown;
  customer_address?: unknown;
  address?: unknown;
  delivery_address?: unknown;
  location?: unknown;
  table_number?: unknown;
  tableNumber?: unknown;
  mesa?: unknown;
  ticket_number?: unknown;
};

export function normalizeOrderType(o: PedidoParaClassificar) {
  const type = String(o.order_type || "").toLowerCase();
  const serviceMode = String(o.service_mode || "").toLowerCase();
  const fulfillmentType = String(o.fulfillment_type || "").toLowerCase();
  const deliveryType = String(o.delivery_type || "").toLowerCase();
  const address = String(
    o.customer_address || o.address || o.delivery_address || o.location || "",
  ).toLowerCase();

  const tableNumber = o.table_number || o.tableNumber || o.mesa;

  if (
    type === "table" ||
    type === "mesa" ||
    serviceMode === "table" ||
    serviceMode === "mesa" ||
    fulfillmentType === "table" ||
    fulfillmentType === "mesa" ||
    deliveryType === "table" ||
    deliveryType === "mesa" ||
    tableNumber ||
    address.includes("mesa")
  ) {
    return "table";
  }

  if (
    type === "pickup" ||
    type === "retirada" ||
    serviceMode === "pickup" ||
    serviceMode === "retirada" ||
    fulfillmentType === "pickup" ||
    fulfillmentType === "retirada" ||
    deliveryType === "pickup" ||
    deliveryType === "retirada" ||
    o.ticket_number ||
    address.includes("retirada") ||
    address.includes("balcão") ||
    address.includes("balcao")
  ) {
    return "pickup";
  }

  return "delivery";
}

import { OrderItem } from "@/types/order";

export const formatItemName = (it: any) => {
  if (it.product_name) return it.product_name;
  if (it.name) return it.name;
  if (it.title) return it.title;
  if (it.type === "pizza" && it.flavors) {
    return `Pizza ${it.size || ""} (${it.flavors.join(" / ")})`;
  }
  if (it.type === "beverage") return it.name || "Bebida";
  return it.nome || "Item";
};

export const getItemPrice = (it: any) => {
  return it.total_price ?? it.price ?? it.unit_price ?? it.total ?? 0;
};

export function normalizeOrderType(o: any) {
  const type = String(o.order_type || "").toLowerCase();
  const serviceMode = String(o.service_mode || "").toLowerCase();
  const fulfillmentType = String(o.fulfillment_type || "").toLowerCase();
  const deliveryType = String(o.delivery_type || "").toLowerCase();
  const address = String(o.customer_address || o.address || o.delivery_address || o.location || "").toLowerCase();

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

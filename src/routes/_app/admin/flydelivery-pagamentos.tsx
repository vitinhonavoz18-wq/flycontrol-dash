import { createFileRoute } from "@tanstack/react-router";
import { PagamentosAdmin } from "@/components/flydelivery/pagamentos/PagamentosAdmin";

// Painel Admin › Pagamentos FlyDelivery (Pix com split SyncPay).
export const Route = createFileRoute("/_app/admin/flydelivery-pagamentos")({
  component: PagamentosAdmin,
});

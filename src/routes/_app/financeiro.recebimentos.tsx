import { createFileRoute } from "@tanstack/react-router";
import { RecebimentosDaLoja } from "@/components/flydelivery/pagamentos/RecebimentosDaLoja";

// Configurações › Financeiro › Recebimentos — Pix pago no FlyDelivery.
export const Route = createFileRoute("/_app/financeiro/recebimentos")({
  component: RecebimentosDaLoja,
});

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CascaDoPortal } from "@/components/afiliados/portal/Casca";

/**
 * Tudo que fica em /affiliates: a apresentação do programa, entrar,
 * cadastrar e o painel do parceiro. Fica FORA do painel do restaurante
 * (`_app`) de propósito — o parceiro não tem loja, e as travas do painel
 * ("sem loja? vá se cadastrar") não servem para ele.
 */
export const Route = createFileRoute("/affiliates")({
  head: () => ({
    meta: [
      { title: "FlyControl Parceiros — indique e ganhe todo mês" },
      {
        name: "description",
        content:
          "Programa de parceiros do FlyControl: indique restaurantes e receba comissão recorrente sobre o que eles pagam.",
      },
    ],
  }),
  component: () => (
    <CascaDoPortal>
      <Outlet />
    </CascaDoPortal>
  ),
});

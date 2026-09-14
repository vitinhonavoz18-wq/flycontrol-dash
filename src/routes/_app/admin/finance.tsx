import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * O "Financeiro Global" virou uma aba dentro de Insights Globais.
 *
 * O endereço antigo continua valendo e leva para lá — link salvo nos
 * favoritos não pode virar página de erro só porque a tela mudou de lugar.
 */
export const Route = createFileRoute("/_app/admin/finance")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/analytics" });
  },
});

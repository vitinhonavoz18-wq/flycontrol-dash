import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A antiga tela "FlyPizzarias" virou a aba "Lojas" dentro de Usuários.
 *
 * O endereço continua existindo e leva para lá. Link antigo que morre em
 * página de erro faz a pessoa achar que a funcionalidade sumiu — e ela não
 * sumiu, só mudou de gaveta. É a placa de "mudamos para a loja ao lado" na
 * porta antiga.
 */
export const Route = createFileRoute("/_app/admin/pizzerias")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});

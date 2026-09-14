import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store, Users } from "lucide-react";
import { AbasDaSecao, type AbaDaSecao } from "@/components/admin/AbasDaSecao";
import { UsersDashboard } from "@/components/admin/dashboards/UsersDashboard";
import { PizzeriasDashboard } from "@/components/admin/dashboards/PizzeriasDashboard";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUsersPage,
});

/**
 * Usuários — as contas e as lojas delas, na mesma tela.
 *
 * POR QUE "FLYPIZZARIAS" SUMIU DO MENU
 *
 * Eram duas telas sobre as mesmas pessoas: uma listava a conta, outra listava
 * a loja daquela conta, e quase toda ação (desativar, excluir, abrir no
 * painel) existia nas duas. Quem ia investigar um cliente tinha que pular de
 * uma para a outra e lembrar em qual metade estava a resposta.
 *
 * É o cliente ter a ficha de cadastro numa gaveta e a comanda em outra: nada
 * de errado com as duas gavetas, só que ninguém quer abrir as duas toda vez.
 *
 * Nenhuma funcionalidade foi perdida — a lista de lojas inteira virou a aba
 * "Lojas", com a mesma busca, os mesmos filtros e os mesmos botões.
 */
type Aba = "contas" | "lojas";

const ABAS: readonly AbaDaSecao<Aba>[] = [
  { id: "contas", rotulo: "Contas", icone: Users },
  { id: "lojas", rotulo: "Lojas", icone: Store },
];

function AdminUsersPage() {
  const [aba, setAba] = useState<Aba>("contas");

  return (
    <div className="p-4 pb-20 md:p-8">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Users className="h-6 w-6 text-primary md:h-7 md:w-7" aria-hidden="true" />
          Usuários
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem tem acesso ao sistema e a loja de cada um.
        </p>
      </div>

      <AbasDaSecao abas={ABAS} ativa={aba} onEscolher={setAba} />

      {aba === "contas" ? <UsersDashboard /> : <PizzeriasDashboard />}
    </div>
  );
}

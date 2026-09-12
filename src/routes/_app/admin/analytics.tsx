import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, PieChart } from "lucide-react";
import { AbasDaSecao, type AbaDaSecao } from "@/components/admin/AbasDaSecao";
import { AnalyticsDashboard } from "@/components/admin/dashboards/AnalyticsDashboard";
import { FinanceDashboard } from "@/components/admin/dashboards/FinanceDashboard";

export const Route = createFileRoute("/_app/admin/analytics")({
  component: AdminAnalyticsPage,
});

/**
 * Insights Globais — os números da plataforma inteira.
 *
 * DUAS CONTAS DIFERENTES, LADO A LADO
 *
 * A aba "Movimento" mostra o que as LOJAS vendem: pedidos, ticket médio, quem
 * mais gira. A aba "Financeiro Global" mostra o que a FLYCONTROL recebe: as
 * assinaturas. São bolsos diferentes, e tratá-los como um só já causou
 * confusão nesta tela.
 *
 * Ficam juntas porque a pergunta que leva a uma quase sempre leva à outra:
 * "o movimento caiu — a receita caiu junto?". Separadas em dois itens de
 * menu, responder isso exigia abrir duas telas e comparar de cabeça.
 */
type Aba = "movimento" | "financeiro";

const ABAS: readonly AbaDaSecao<Aba>[] = [
  { id: "movimento", rotulo: "Movimento das lojas", icone: PieChart },
  { id: "financeiro", rotulo: "Financeiro Global", icone: BarChart3 },
];

function AdminAnalyticsPage() {
  const [aba, setAba] = useState<Aba>("movimento");

  return (
    <div className="p-4 pb-20 md:p-8">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <PieChart className="h-6 w-6 text-primary md:h-7 md:w-7" aria-hidden="true" />
          Insights Globais
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O movimento das lojas e o faturamento da plataforma.
        </p>
      </div>

      <AbasDaSecao abas={ABAS} ativa={aba} onEscolher={setAba} />

      {aba === "movimento" ? <AnalyticsDashboard /> : <FinanceDashboard />}
    </div>
  );
}

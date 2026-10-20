import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatCents } from "@/lib/billing/money";
import {
  PLAN_PRICING,
  annualSavingsCents,
  annualSavingsPercentLabel,
  monthlyEquivalentCents,
  type PremiumPlanCode,
} from "@/lib/billing/plans";

/**
 * Os dois cards do Premium: Mensal e Anual.
 *
 * Usado na página pública de planos e na tela de plano dentro do painel —
 * um componente só para os dois lugares nunca mostrarem preços diferentes.
 * Todo número vem de `lib/billing/plans`, a mesma fonte do checkout.
 *
 * Regra de transparência do anual: os R$ 49,90/mês aparecem SEMPRE junto do
 * valor realmente cobrado (R$ 598,80 por ano). Sozinho, o equivalente mensal
 * pareceria uma mensalidade que não existe.
 */

export const PREMIUM_BENEFITS = [
  "Pedidos sem cobrança por unidade",
  "Gestão completa de pedidos",
  "Dashboard operacional",
  "Cardápio e clientes",
  "Mesas",
  "Garçons",
  "Comissões",
  "Estoque & PDV",
] as const;

type Props = {
  /** O botão de cada card (link para o checkout, ou aviso de bloqueio). */
  renderCta: (code: PremiumPlanCode) => ReactNode;
  /** Texto curto abaixo do botão (ex.: "Você já está neste plano"). */
  renderNote?: (code: PremiumPlanCode) => ReactNode;
};

export function PremiumPlanCards({ renderCta, renderNote }: Props) {
  const mensal = PLAN_PRICING.premium;
  const anual = PLAN_PRICING.premium_anual;

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <Card className="flex flex-col" data-testid="card-premium-mensal">
        <CardHeader className="space-y-3">
          <div className="flex min-h-6 flex-wrap items-center gap-2">
            <Badge variant="outline">Mensal</Badge>
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight">{mensal.name}</h3>
          <div>
            <span className="text-3xl font-black text-primary sm:text-4xl">
              {formatCents(mensal.cycleFeeCents)}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            Cobrado {formatCents(mensal.cycleFeeCents)} a cada mês.
          </p>
          <p className="text-sm text-muted-foreground">{mensal.description}</p>
        </CardHeader>

        <CardContent className="flex-1">
          <BenefitList />
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-2">
          {renderCta("premium")}
          {renderNote?.("premium")}
        </CardFooter>
      </Card>

      {/* Destaque moderado: borda e fundo levemente coloridos, sem esconder
          o card mensal nem aumentar a letra a ponto de atrapalhar a leitura. */}
      <Card
        className="relative flex flex-col border-primary/60 bg-gradient-to-b from-primary/[0.07] to-transparent shadow-sm ring-1 ring-primary/20"
        data-testid="card-premium-anual"
      >
        <CardHeader className="space-y-3">
          <div className="flex min-h-6 flex-wrap items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">Melhor custo-benefício</Badge>
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              Economize {annualSavingsPercentLabel()}
            </Badge>
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight">{anual.name}</h3>
          <div>
            <span className="text-3xl font-black text-primary sm:text-4xl">
              {formatCents(monthlyEquivalentCents("premium_anual"))}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
            <span className="ml-1 text-xs text-muted-foreground">(valor equivalente)</span>
          </div>
          <p className="text-sm font-bold text-foreground">
            Cobrado {formatCents(anual.cycleFeeCents)} por ano.
          </p>
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            Economize {formatCents(annualSavingsCents())} em comparação a 12 mensalidades de{" "}
            {formatCents(mensal.cycleFeeCents)}.
          </p>
          <p className="text-xs text-muted-foreground">
            Cobrança única de {formatCents(anual.cycleFeeCents)} por 12 meses de acesso. Não existe
            cobrança mensal de {formatCents(monthlyEquivalentCents("premium_anual"))} neste plano.
          </p>
        </CardHeader>

        <CardContent className="flex-1">
          <BenefitList />
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-2">
          {renderCta("premium_anual")}
          {renderNote?.("premium_anual")}
        </CardFooter>
      </Card>
    </div>
  );
}

function BenefitList() {
  return (
    <ul className="space-y-2 text-sm">
      {PREMIUM_BENEFITS.map((benefit) => (
        <li key={benefit} className="flex items-start gap-2">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          {benefit}
        </li>
      ))}
    </ul>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/plans")({ component: PlansPage });

const premium = PLAN_PRICING.premium;
const cents = PLAN_PRICING.cents;

const PREMIUM_BENEFITS = [
  "Pedidos sem cobrança por unidade",
  "Gestão completa de pedidos",
  "Dashboard operacional",
  "Cardápio",
  "Clientes",
  "Mesas",
  "Garçons",
  "Comissões",
] as const;

const CENTS_BENEFITS = [
  "Gestão de pedidos",
  "Dashboard operacional",
  "Cardápio",
  "Clientes",
  "Pagamento conforme o uso",
  "Sem mensalidade fixa",
] as const;

const CENTS_EXCLUSIONS = ["Mesas", "Garçons", "Comissões"] as const;

type ComparisonRow = {
  feature: string;
  premium: string | boolean;
  cents: string | boolean;
};

const COMPARISON: readonly ComparisonRow[] = [
  { feature: "Gestão de pedidos", premium: true, cents: true },
  { feature: "Cardápio", premium: true, cents: true },
  { feature: "Clientes", premium: true, cents: true },
  { feature: "Dashboard operacional", premium: true, cents: true },
  { feature: "Cobrança fixa mensal", premium: formatCents(premium.monthlyFeeCents), cents: false },
  { feature: "Cobrança por pedido", premium: false, cents: true },
  { feature: "Taxa de cadastro", premium: false, cents: formatCents(cents.setupFeeCents) },
  { feature: "Mesas", premium: true, cents: false },
  { feature: "Garçons", premium: true, cents: false },
  { feature: "Comissões", premium: true, cents: false },
  { feature: "Promoção por volume", premium: "Não se aplica", cents: true },
  {
    feature: "Preço após atingir a meta",
    premium: "Não se aplica",
    cents: `${formatCents(cents.promotionalOrderUnitPriceCents)}/pedido`,
  },
];

function ComparisonValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        Incluído
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
        Não incluído
      </span>
    );
  }
  return <span className="font-medium text-foreground">{value}</span>;
}

function PlansPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-x border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="FlyControl" className="h-8 w-auto" />
          </Link>
          <Button asChild variant="ghost" size="sm" className="h-11">
            <Link to="/login">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao login
            </Link>
          </Button>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Escolha seu plano</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Dois modelos de cobrança para operações diferentes. Você pode trocar de plano depois.
          </p>
        </div>

        {/* Uma coluna no celular, duas a partir de md. Os cards usam
            `flex flex-col` + `mt-auto` no rodapé para os botões ficarem
            alinhados mesmo com listas de tamanhos diferentes. */}
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <Card className="flex flex-col border-primary/40">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black">{premium.name}</h2>
                <Badge className="bg-primary text-primary-foreground">Plano completo</Badge>
              </div>
              <div>
                <span className="text-3xl font-black text-primary">
                  {formatCents(premium.monthlyFeeCents)}
                </span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <p className="text-sm text-muted-foreground">{premium.description}</p>
            </CardHeader>

            <CardContent className="flex-1">
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
            </CardContent>

            <CardFooter>
              <Button asChild className="h-12 w-full text-base font-bold">
                <Link to="/signup" search={{ plan: "premium" }}>
                  Escolher {premium.name}
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black">{cents.name}</h2>
                <Badge variant="outline">Pague por pedido</Badge>
              </div>
              <div>
                <span className="text-3xl font-black text-primary">
                  {formatCents(cents.setupFeeCents)}
                </span>
                <span className="text-sm text-muted-foreground"> de cadastro</span>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  + {formatCents(cents.defaultOrderUnitPriceCents)} por pedido
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{cents.description}</p>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              <ul className="space-y-2 text-sm">
                {CENTS_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    {benefit}
                  </li>
                ))}
              </ul>

              {/* A regra da promoção fica explícita nos dois sentidos: como se
                  ganha e como se perde. Mostrar só o ganho seria enganoso. */}
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  Ao atingir {cents.promotionThresholdOrders} pedidos válidos em um ciclo, o próximo
                  ciclo passa a custar {formatCents(cents.promotionalOrderUnitPriceCents)} por
                  pedido.
                </p>
                <p className="text-muted-foreground">
                  Para manter esse valor, é necessário atingir pelo menos{" "}
                  {cents.promotionThresholdOrders} pedidos válidos em cada ciclo. Se um ciclo ficar
                  abaixo da meta, o ciclo seguinte volta para{" "}
                  {formatCents(cents.defaultOrderUnitPriceCents)} por pedido.
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Não incluído
                </p>
                <ul className="space-y-1 text-sm">
                  {CENTS_EXCLUSIONS.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-muted-foreground">
                      <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>

            <CardFooter>
              <Button asChild variant="outline" className="h-12 w-full text-base font-bold">
                <Link to="/signup" search={{ plan: "cents" }}>
                  Escolher {cents.name}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <section className="mt-10 sm:mt-14" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading" className="mb-4 text-lg font-bold sm:text-xl">
            Comparação detalhada
          </h2>

          {/* Celular: um bloco por funcionalidade, com os dois planos
              empilhados. Uma tabela de 3 colunas em 320px ficaria ilegível. */}
          <div className="space-y-2 md:hidden">
            {COMPARISON.map((row) => (
              <div key={row.feature} className="rounded-lg border border-border bg-card p-3">
                <p className="mb-2 text-sm font-semibold">{row.feature}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="mb-0.5 text-muted-foreground">{premium.name}</dt>
                    <dd>
                      <ComparisonValue value={row.premium} />
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-muted-foreground">{cents.name}</dt>
                    <dd>
                      <ComparisonValue value={row.cents} />
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Funcionalidade
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {premium.name}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {cents.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.feature}
                    </th>
                    <td className="px-4 py-3">
                      <ComparisonValue value={row.premium} />
                    </td>
                    <td className="px-4 py-3">
                      <ComparisonValue value={row.cents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Já possui uma conta?{" "}
          <Link to="/login" className="font-semibold text-primary underline">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}

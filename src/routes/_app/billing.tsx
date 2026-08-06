import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { calculateCycleProgress, type CycleProgress } from "@/lib/billing/cycleProgress";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING, isPublicPlanCode, type PlanCode } from "@/lib/billing/plans";
import {
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionStatus";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { FEATURE_LABELS, featuresForPlan } from "@/lib/planPermissions";

export const Route = createFileRoute("/_app/billing")({ component: BillingPage });

/** Postgres: relação inexistente — as migrations de cobrança não foram aplicadas. */
const UNDEFINED_TABLE = "42P01";

type Snapshot = {
  companyName: string;
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  activatedAt: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  progress: CycleProgress | null;
  invoices: InvoiceRow[];
};

type InvoiceRow = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
};

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pendente",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  processing: {
    label: "Em processamento",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  paid: {
    label: "Pago",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  overdue: {
    label: "Vencido",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  canceled: { label: "Cancelado", className: "border-border bg-muted text-muted-foreground" },
  draft: { label: "Rascunho", className: "border-border bg-muted text-muted-foreground" },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function BillingPage() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<"missing_tables" | "no_subscription" | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const db = asBillingDb(supabase);

    // RLS já limita ao que o dono pode ver; o filtro por owner_id evita
    // trazer linhas de outras empresas caso o usuário seja administrador.
    const { data: company } = await supabase
      .from("pizzerias")
      .select("id, name")
      .eq("owner_id", user.id)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();

    if (!company) {
      setUnavailable("no_subscription");
      setLoading(false);
      return;
    }

    const { data, error } = await db
      .from("subscriptions")
      .select(
        "id, status, activated_at, plans(code, name), " +
          "billing_cycles!subscriptions_current_cycle_fkey(cycle_start, cycle_end, unit_price_cents, billable_order_count, promotion_threshold_orders, qualified_from_previous_cycle)",
      )
      .eq("company_id", company.id)
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === UNDEFINED_TABLE) {
        setUnavailable("missing_tables");
        setLoading(false);
        return;
      }
      console.error("[billing] falha ao carregar assinatura:", error);
      toast.error("Não foi possível carregar seu plano.");
      setLoading(false);
      return;
    }

    const row = data as {
      id: string;
      status: string;
      activated_at: string | null;
      plans: { code: string; name: string } | null;
      billing_cycles: {
        cycle_start: string;
        cycle_end: string;
        unit_price_cents: number;
        billable_order_count: number;
        promotion_threshold_orders: number;
        qualified_from_previous_cycle: boolean;
      } | null;
    } | null;

    if (!row) {
      setUnavailable("no_subscription");
      setLoading(false);
      return;
    }

    const planCode = isPublicPlanCode(row.plans?.code) ? row.plans.code : "premium";
    const cycle = row.billing_cycles;

    // A taxa de cadastro sai da estimativa assim que aparece em uma fatura.
    const { data: setupCharged } = await db
      .from("subscription_setup_fee_charged")
      .select("subscription_id")
      .eq("subscription_id", row.id)
      .maybeSingle();

    const { data: invoiceRows } = await db
      .from("invoices")
      .select("id, invoice_number, status, total_cents, created_at, paid_at")
      .eq("subscription_id", row.id);

    const invoices = ((invoiceRows ?? []) as Array<Record<string, unknown>>)
      .map((i) => ({
        id: String(i.id),
        number: String(i.invoice_number),
        status: String(i.status),
        totalCents: Number(i.total_cents ?? 0),
        createdAt: String(i.created_at),
        paidAt: i.paid_at ? String(i.paid_at) : null,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    setSnapshot({
      companyName: company.name,
      planCode,
      planName: row.plans?.name ?? PLAN_PRICING[planCode].name,
      status: row.status as SubscriptionStatus,
      activatedAt: row.activated_at,
      cycleStart: cycle?.cycle_start ?? null,
      cycleEnd: cycle?.cycle_end ?? null,
      progress: cycle
        ? calculateCycleProgress(
            {
              planCode,
              unitPriceCents: cycle.unit_price_cents,
              promotionThresholdOrders: cycle.promotion_threshold_orders,
              billableOrderCount: cycle.billable_order_count,
              qualifiedFromPreviousCycle: cycle.qualified_from_previous_cycle,
              setupFeeAlreadyCharged: !!setupCharged,
              cycleEnd: new Date(cycle.cycle_end),
              now: new Date(),
            },
            formatCents,
          )
        : null,
      invoices,
    });
    setUnavailable(null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Carregando plano e cobrança…</span>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                {unavailable === "missing_tables"
                  ? "A cobrança ainda não está configurada nesta instalação."
                  : "Sua assinatura ainda não foi criada."}
              </p>
              <p className="text-muted-foreground">
                {unavailable === "missing_tables"
                  ? "Fale com o suporte da FlyControl para concluir a configuração."
                  : "Nossa equipe conclui a configuração do seu plano em breve. Sua operação continua normal."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!snapshot) return null;

  const pricing = PLAN_PRICING[snapshot.planCode];
  const isUsageBased = snapshot.planCode === "cents";
  const includedFeatures = featuresForPlan(snapshot.planCode);
  const missingFeatures = (
    Object.keys(FEATURE_LABELS) as Array<keyof typeof FEATURE_LABELS>
  ).filter((f) => !includedFeatures.includes(f));

  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8">
      <SectionHeader
        title="Plano e cobrança"
        description={snapshot.companyName}
        action={
          isUsageBased ? (
            <Button asChild variant="outline" className="h-11 gap-2">
              <a href="/plans" target="_blank" rel="noreferrer">
                Conhecer o PREMIUM <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano atual</p>
              <p className="text-xl font-black">{snapshot.planName}</p>
            </div>
            <Badge variant="outline" className="font-bold">
              {SUBSCRIPTION_STATUS_LABELS[snapshot.status] ?? snapshot.status}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Cobrança</dt>
              <dd className="font-medium">
                {isUsageBased
                  ? `${formatCents(snapshot.progress?.unitPriceCents ?? pricing.defaultOrderUnitPriceCents)}/pedido`
                  : `${formatCents(pricing.monthlyFeeCents)}/mês`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ativa desde</dt>
              <dd className="font-medium">{formatDate(snapshot.activatedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ciclo atual</dt>
              <dd className="font-medium">
                {formatDate(snapshot.cycleStart)} – {formatDate(snapshot.cycleEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dias restantes</dt>
              <dd className="font-medium">{snapshot.progress?.daysRemaining ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Progresso da meta: só faz sentido em plano por uso. */}
      {isUsageBased && snapshot.progress && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pedidos válidos neste ciclo
                </p>
                <p className="text-2xl font-black">
                  {snapshot.progress.billableOrderCount}
                  <span className="text-base font-medium text-muted-foreground">
                    {" "}
                    de {snapshot.progress.thresholdOrders}
                  </span>
                </p>
              </div>
              <p className="text-sm font-bold text-primary">
                {snapshot.progress.percent.toFixed(1)}%
              </p>
            </div>

            <div
              className="h-3 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={snapshot.progress.billableOrderCount}
              aria-valuemin={0}
              aria-valuemax={snapshot.progress.thresholdOrders}
              aria-label={`${snapshot.progress.billableOrderCount} de ${snapshot.progress.thresholdOrders} pedidos válidos`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  snapshot.progress.state === "losing_promotion" ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${snapshot.progress.percent}%` }}
              />
            </div>

            <p
              className={`rounded-lg p-3 text-sm ${
                snapshot.progress.state === "losing_promotion"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "bg-primary/5 text-foreground"
              }`}
            >
              {snapshot.progress.message}
            </p>

            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Preço atual</dt>
                <dd className="font-bold">
                  {formatCents(snapshot.progress.unitPriceCents)} por pedido
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Preço no próximo ciclo</dt>
                <dd className="font-bold">
                  {formatCents(snapshot.progress.nextCycleUnitPriceCents)} por pedido
                </dd>
              </div>
            </dl>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Estimativa deste ciclo</span>
                <strong className="text-lg text-primary">
                  {formatCents(snapshot.progress.estimatedTotalCents)}
                </strong>
              </div>
              {snapshot.progress.setupFeeCents > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Inclui a taxa única de cadastro de {formatCents(snapshot.progress.setupFeeCents)}.
                </p>
              )}
              {/* Deixar claro que é estimativa evita a sensação de cobrança
                  surpresa quando o valor final diferir. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Valor estimado pelos pedidos já registrados. Pode mudar até o fechamento do ciclo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isUsageBased && snapshot.progress && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="font-semibold">
              Mensalidade fixa de {formatCents(pricing.monthlyFeeCents)}
            </p>
            <p className="text-muted-foreground">
              Não há cobrança por pedido. Os {snapshot.progress.billableOrderCount} pedidos deste
              ciclo aparecem apenas como métrica da sua operação.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-bold">Funcionalidades do seu plano</h2>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {includedFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <Check
                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {FEATURE_LABELS[feature]}
              </li>
            ))}
          </ul>

          {missingFeatures.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-semibold">
                Disponível no PREMIUM: {missingFeatures.map((f) => FEATURE_LABELS[f]).join(", ")}.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2 h-10">
                <a href="/plans" target="_blank" rel="noreferrer">
                  Fazer upgrade <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Receipt className="h-4 w-4" aria-hidden="true" /> Faturas
          </h2>

          {snapshot.invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma fatura emitida ainda. A primeira sai no fechamento deste ciclo.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {snapshot.invoices.map((invoice) => {
                const style = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.draft;
                return (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invoice.number}</p>
                      <p className="text-xs text-muted-foreground">
                        Emitida em {formatDate(invoice.createdAt)}
                        {invoice.paidAt && ` · paga em ${formatDate(invoice.paidAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${style.className}`}
                      >
                        {style.label}
                      </Badge>
                      <strong className="text-sm">{formatCents(invoice.totalCents)}</strong>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

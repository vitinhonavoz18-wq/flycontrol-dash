/**
 * Financeiro Global — quanto a FlyControl fatura, não quanto as lojas vendem.
 *
 * A versão anterior somava o faturamento de PEDIDOS das lojas (o dinheiro que
 * o cliente final paga pela pizza). Isso não é receita da FlyControl — é
 * receita do restaurante. O que a plataforma efetivamente recebe é a
 * mensalidade/assinatura de cada loja, e é isso que esta tela mostra agora.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { formatCents } from "@/lib/billing/money";
import {
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionStatus";

/** Migration ainda não aplicada: a tabela não existe. */
const UNDEFINED_TABLE = "42P01";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  past_due: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

type RawPriceVersion = { monthly_fee_cents: number | null };
type RawCycle = { total_amount_cents: number | null };
type RawInvoice = {
  subscription_id: string;
  total_cents: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};
type RawSubscriptionRow = {
  id: string;
  company_id: string;
  status: string;
  billing_model: string;
  pizzerias: { name: string } | null;
  plans: { code: string; name: string } | null;
  plan_price_versions: RawPriceVersion | RawPriceVersion[] | null;
  billing_cycles: RawCycle | RawCycle[] | null;
};

type SubscriptionRevenueRow = {
  id: string;
  companyName: string;
  planName: string;
  status: string;
  monthlyValueCents: number;
  lastInvoiceCents: number | null;
  lastInvoiceStatus: string | null;
  lastInvoicePaidAt: string | null;
};

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export const FinanceDashboard = () => {
  const [rows, setRows] = useState<SubscriptionRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const db = asBillingDb(supabase);

    const { data: subsData, error: subsError } = await db
      .from("subscriptions")
      .select(
        "id, company_id, status, billing_model, " +
          "pizzerias(name), plans(code, name), " +
          "plan_price_versions(monthly_fee_cents), " +
          "billing_cycles!subscriptions_current_cycle_fkey(total_amount_cents)",
      );

    if (subsError) {
      // Sem as migrations de cobrança aplicadas a tela não tem o que
      // mostrar — e dizer isso é mais útil que um erro de banco cru.
      if (subsError.code === UNDEFINED_TABLE) {
        setMissingTables(true);
        setRows([]);
        setLoading(false);
        return;
      }
      toast.error("Não foi possível carregar as assinaturas.");
      console.error("[admin/finance]", subsError);
      setLoading(false);
      return;
    }

    const activeSubs = ((subsData ?? []) as RawSubscriptionRow[]).filter(
      (s) => s.status === "active" || s.status === "past_due",
    );

    const { data: invoicesData } = await db
      .from("invoices")
      .select("subscription_id, total_cents, status, paid_at, created_at")
      .order("created_at", { ascending: false });

    // A primeira fatura encontrada por assinatura já é a mais recente, graças
    // ao order() acima — não precisa comparar datas manualmente.
    const lastInvoiceBySub = new Map<string, RawInvoice>();
    for (const inv of (invoicesData ?? []) as RawInvoice[]) {
      if (!lastInvoiceBySub.has(inv.subscription_id)) {
        lastInvoiceBySub.set(inv.subscription_id, inv);
      }
    }

    setRows(
      activeSubs.map((s) => {
        const priceVersion = firstOf(s.plan_price_versions);
        const cycle = firstOf(s.billing_cycles);
        const lastInvoice = lastInvoiceBySub.get(s.id) ?? null;
        const monthlyFeeCents = Number(priceVersion?.monthly_fee_cents ?? 0);
        // Plano fixo: o valor mensal é sempre a mensalidade contratada.
        // Plano por pedido (CENTS): não existe "mensalidade fixa" — o valor
        // que mais representa o que a loja está pagando é a última fatura
        // emitida; sem fatura ainda, usa o total acumulado no ciclo aberto.
        const monthlyValueCents =
          s.billing_model === "monthly_fixed"
            ? monthlyFeeCents
            : Number(lastInvoice?.total_cents ?? cycle?.total_amount_cents ?? 0);

        return {
          id: s.id,
          companyName: s.pizzerias?.name ?? "Empresa sem nome",
          planName: s.plans?.name ?? "—",
          status: s.status,
          monthlyValueCents,
          lastInvoiceCents: lastInvoice ? Number(lastInvoice.total_cents) : null,
          lastInvoiceStatus: lastInvoice?.status ?? null,
          lastInvoicePaidAt: lastInvoice?.paid_at ?? null,
        };
      }),
    );
    setMissingTables(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalMonthlyCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.monthlyValueCents, 0),
    [rows],
  );
  const averageCents = rows.length ? Math.round(totalMonthlyCents / rows.length) : 0;

  if (loading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (missingTables) {
    return (
      <div className="p-8">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                As tabelas de cobrança ainda não existem neste projeto.
              </p>
              <p className="text-muted-foreground">
                Aplique as migrations <code>billing_foundation</code> e{" "}
                <code>billing_usage_hook</code> no Supabase, nessa ordem, e recarregue esta página.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 pb-20">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financeiro Global</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que a FlyControl fatura com a assinatura das lojas — não o que as lojas vendem.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Faturamento mensal da plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCents(totalMonthlyCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Soma das assinaturas ativas de todas as lojas cadastradas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lojas assinantes ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ticket médio por loja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(averageCents)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Assinaturas ativas</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma loja com assinatura ativa no momento.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor mensal</TableHead>
                <TableHead>Última fatura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .slice()
                .sort((a, b) => b.monthlyValueCents - a.monthlyValueCents)
                .map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.companyName}</TableCell>
                    <TableCell>{row.planName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[row.status] ?? ""}>
                        {SUBSCRIPTION_STATUS_LABELS[row.status as SubscriptionStatus] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-emerald-600">
                      {formatCents(row.monthlyValueCents)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastInvoiceCents !== null
                        ? `${formatCents(row.lastInvoiceCents)} · ${
                            row.lastInvoiceStatus === "paid"
                              ? `pago em ${formatDate(row.lastInvoicePaidAt)}`
                              : "pendente"
                          }`
                        : "Sem fatura ainda"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

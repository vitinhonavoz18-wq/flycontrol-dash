import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { formatCents } from "@/lib/billing/money";
import { PUBLIC_PLAN_CODES, type PlanCode } from "@/lib/billing/plans";
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  availableActions,
  type AdminAction,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptionStatus";
import {
  changeSubscriptionPlan,
  changeSubscriptionStatus,
} from "@/lib/billing/subscriptionAdmin.functions";
import { asBillingDb } from "@/lib/billing/supabaseBridge";

/** Linha achatada do que a tela precisa mostrar. */
type SubscriptionView = {
  id: string;
  companyId: string;
  companyName: string;
  planCode: string;
  planName: string;
  status: string;
  billingModel: string;
  activatedAt: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  unitPriceCents: number;
  billableOrderCount: number;
  promotionThresholdOrders: number;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  past_due: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  pending_activation: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  pending_payment: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  suspended: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  canceled: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

/** Migration ainda não aplicada: a tabela não existe. */
const UNDEFINED_TABLE = "42P01";

/**
 * Formato cru devolvido pelo Supabase com os relacionamentos embutidos.
 * O ciclo vem como objeto ou lista conforme a cardinalidade que o PostgREST
 * infere da chave estrangeira, então os dois casos são tratados.
 */
type RawCycle = {
  cycle_start: string | null;
  cycle_end: string | null;
  unit_price_cents: number | null;
  billable_order_count: number | null;
  promotion_threshold_orders: number | null;
};

type RawSubscriptionRow = {
  id: string;
  company_id: string;
  status: string;
  billing_model: string;
  activated_at: string | null;
  pizzerias: { name: string } | null;
  plans: { code: string; name: string } | null;
  billing_cycles: RawCycle | RawCycle[] | null;
};

type PendingAction =
  | { kind: "status"; row: SubscriptionView; action: AdminAction }
  | { kind: "plan"; row: SubscriptionView; planCode: PlanCode };

export function SubscriptionAdminPanel() {
  const [rows, setRows] = useState<SubscriptionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const db = asBillingDb(supabase);

    const { data, error } = await db
      .from("subscriptions")
      .select(
        "id, company_id, status, billing_model, activated_at, " +
          "pizzerias(name), plans(code, name), " +
          "billing_cycles!subscriptions_current_cycle_fkey(cycle_start, cycle_end, unit_price_cents, billable_order_count, promotion_threshold_orders)",
      );

    if (error) {
      // Sem as migrations aplicadas a tela não tem o que mostrar — e dizer
      // isso é mais útil que um erro de banco cru.
      if (error.code === UNDEFINED_TABLE) {
        setMissingTables(true);
        setRows([]);
        setLoading(false);
        return;
      }
      toast.error("Não foi possível carregar as assinaturas.");
      console.error("[admin/subscriptions]", error);
      setLoading(false);
      return;
    }

    const raw = (data ?? []) as RawSubscriptionRow[];
    setRows(
      raw.map((item) => {
        const cycle = Array.isArray(item.billing_cycles)
          ? item.billing_cycles[0]
          : item.billing_cycles;
        return {
          id: item.id,
          companyId: item.company_id,
          companyName: item.pizzerias?.name ?? "Empresa sem nome",
          planCode: item.plans?.code ?? "",
          planName: item.plans?.name ?? "—",
          status: item.status,
          billingModel: item.billing_model,
          activatedAt: item.activated_at ?? null,
          cycleStart: cycle?.cycle_start ?? null,
          cycleEnd: cycle?.cycle_end ?? null,
          unitPriceCents: Number(cycle?.unit_price_cents ?? 0),
          billableOrderCount: Number(cycle?.billable_order_count ?? 0),
          promotionThresholdOrders: Number(cycle?.promotion_threshold_orders ?? 0),
        };
      }),
    );
    setMissingTables(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "todos" && row.status !== statusFilter) return false;
      if (term && !row.companyName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  async function confirmAction() {
    if (!pending) return;
    setSubmitting(true);
    try {
      if (pending.kind === "status") {
        await changeSubscriptionStatus({
          data: {
            subscriptionId: pending.row.id,
            targetStatus: pending.action.targetStatus,
            reason: reason.trim() || undefined,
          },
        });
        toast.success(
          `${pending.row.companyName}: ${pending.action.label.toLowerCase()} concluído.`,
        );
      } else {
        await changeSubscriptionPlan({
          data: {
            subscriptionId: pending.row.id,
            planCode: pending.planCode,
            reason: reason.trim() || undefined,
          },
        });
        toast.success(
          `${pending.row.companyName} passou para o plano ${pending.planCode.toUpperCase()}.`,
        );
      }
      setPending(null);
      setReason("");
      await load();
    } catch (err) {
      // A mensagem vem da função do servidor, já em português e sem detalhe
      // técnico — a máquina de estados e a checagem de permissão escrevem
      // exatamente o que o administrador precisa ler.
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Carregando assinaturas…</span>
      </div>
    );
  }

  if (missingTables) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">As tabelas de cobrança ainda não existem neste projeto.</p>
            <p className="text-muted-foreground">
              Aplique as migrations <code>billing_foundation</code> e{" "}
              <code>billing_usage_hook</code> no Supabase, nessa ordem, e recarregue esta página.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Assinaturas"
        description={`${filtered.length} de ${rows.length} empresas`}
        action={
          <Button variant="outline" className="h-11 gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar empresa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar empresa por nome"
          />
        </div>
        <select
          className="h-11 rounded-md border border-input bg-background px-3 text-sm sm:w-56"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por status da assinatura"
        >
          <option value="todos">Todos os status</option>
          {SUBSCRIPTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SUBSCRIPTION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-12 text-sm text-muted-foreground">
          Nenhuma assinatura encontrada com estes filtros.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((row) => {
            const actions = availableActions(row.status);
            const isUsage = row.billingModel === "usage_per_order";
            const progress =
              row.promotionThresholdOrders > 0
                ? Math.min(100, (row.billableOrderCount / row.promotionThresholdOrders) * 100)
                : 0;

            return (
              <Card key={row.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{row.companyName}</h3>
                      <p className="text-xs text-muted-foreground">
                        {row.planName} · ativada em {formatDate(row.activatedAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 font-bold ${STATUS_STYLES[row.status] ?? ""}`}
                    >
                      {SUBSCRIPTION_STATUS_LABELS[row.status as SubscriptionStatus] ?? row.status}
                    </Badge>
                  </div>

                  {row.cycleStart ? (
                    <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground">Ciclo</dt>
                        <dd className="font-medium">
                          {formatDate(row.cycleStart)} – {formatDate(row.cycleEnd)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Pedidos válidos</dt>
                        <dd className="font-medium">{row.billableOrderCount}</dd>
                      </div>
                      {isUsage && (
                        <>
                          <div>
                            <dt className="text-muted-foreground">Preço vigente</dt>
                            <dd className="font-medium">
                              {formatCents(row.unitPriceCents)}/pedido
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Meta</dt>
                            <dd className="font-medium">
                              {row.billableOrderCount} / {row.promotionThresholdOrders}
                              <span className="ml-1 text-muted-foreground">
                                ({progress.toFixed(0)}%)
                              </span>
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  ) : (
                    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                      Sem ciclo aberto. O consumo só passa a ser registrado depois da ativação.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {actions.map((action) => (
                      <Button
                        key={action.key}
                        size="sm"
                        variant={action.destructive ? "outline" : "default"}
                        className={`h-10 ${action.destructive ? "border-destructive/30 text-destructive hover:bg-destructive/10" : ""}`}
                        onClick={() => {
                          setReason("");
                          setPending({ kind: "status", row, action });
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}

                    {PUBLIC_PLAN_CODES.filter((code) => code !== row.planCode).map((code) => (
                      <Button
                        key={code}
                        size="sm"
                        variant="ghost"
                        className="h-10"
                        onClick={() => {
                          setReason("");
                          setPending({ kind: "plan", row, planCode: code });
                        }}
                      >
                        Mudar para {code.toUpperCase()}
                      </Button>
                    ))}

                    {actions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Assinatura encerrada. Voltar a operar exige uma assinatura nova.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "status"
                ? pending.action.label
                : `Mudar para ${pending?.planCode.toUpperCase()}`}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Empresa: <strong className="text-foreground">{pending?.row.companyName}</strong>
                </p>
                {pending?.kind === "status" && pending.action.key === "cancel" && (
                  <p className="text-destructive">
                    O cancelamento é definitivo. Uma assinatura encerrada não volta a operar — seria
                    preciso criar outra. Nenhum dado é apagado.
                  </p>
                )}
                {pending?.kind === "status" && pending.action.key === "suspend" && (
                  <p>O acesso ao painel é cortado até a reativação. Nenhum dado é apagado.</p>
                )}
                {pending?.kind === "status" && pending.action.targetStatus === "active" && (
                  <p>
                    A ativação abre o primeiro ciclo de cobrança e passa a registrar o consumo dos
                    pedidos.
                  </p>
                )}
                {pending?.kind === "plan" && (
                  <p>
                    O novo plano vale a partir do próximo ciclo. Dados de Mesas, Garçons e Comissões
                    são preservados, apenas ficam inacessíveis no CENTS.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="admin-reason">Motivo (fica registrado na auditoria)</Label>
            <Input
              id="admin-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: pagamento confirmado por PIX em 06/08"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={submitting}>
              Voltar
            </Button>
            <Button onClick={() => void confirmAction()} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

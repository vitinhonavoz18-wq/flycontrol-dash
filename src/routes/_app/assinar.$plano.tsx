/**
 * Checkout do Premium (Mensal ou Anual) para quem já tem conta.
 *
 * A tela mostra, ANTES de qualquer pagamento: quanto sai hoje, qual plano,
 * por quanto tempo vale, como funciona a renovação e como cancelar. Só
 * depois do aceite o cliente é levado à InfinityPay.
 *
 * O navegador não manda valor nenhum: manda só "quero o plano X". Quem diz
 * quanto custa e de qual loja se trata é o servidor.
 */

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CHECKOUT_TOKEN_STORAGE_KEY } from "@/lib/billing/checkout";
import { formatCents } from "@/lib/billing/money";
import { isPremiumPlanCode, type PremiumPlanCode } from "@/lib/billing/plans";
import {
  getPremiumOffer,
  startPremiumCheckout,
  type PremiumOffer,
} from "@/lib/billing/premiumCheckout.functions";

export const Route = createFileRoute("/_app/assinar/$plano")({ component: AssinarPage });

function AssinarPage() {
  const { plano } = useParams({ from: "/_app/assinar/$plano" });
  const [offer, setOffer] = useState<PremiumOffer | undefined>(undefined);
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    void getPremiumOffer()
      .then((o) => active && setOffer(o))
      .catch(() => active && setOffer(null));
    return () => {
      active = false;
    };
  }, []);

  if (!isPremiumPlanCode(plano)) {
    return (
      <Shell>
        <Aviso titulo="Plano não encontrado" texto="Escolha um dos planos Premium." />
        <Button asChild className="h-11">
          <Link to="/plans">Ver os planos</Link>
        </Button>
      </Shell>
    );
  }
  const code: PremiumPlanCode = plano;

  if (offer === undefined) {
    return (
      <Shell>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </div>
      </Shell>
    );
  }

  if (offer === null) {
    return (
      <Shell>
        <Aviso
          titulo="Não encontramos seu estabelecimento"
          texto="Entre com o login do dono da loja ou fale com a equipe da FlyControl."
        />
      </Shell>
    );
  }

  const { decision, summary } = offer.options[code];
  const outro: PremiumPlanCode = code === "premium" ? "premium_anual" : "premium";
  const annual = summary.intervalMonths === 12;
  const current = offer.current;

  async function irParaPagamento() {
    if (!accepted || sending) return;
    setSending(true);
    try {
      const { url, token } = await startPremiumCheckout({
        data: { planCode: code, acceptedTerms: true },
      });
      // O token amarra o retorno da InfinityPay a esta contratação. A URL de
      // retorno, sozinha, não identifica ninguém.
      localStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, JSON.stringify({ token, planCode: code }));
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir o pagamento.");
      setSending(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black sm:text-2xl">Contratar {summary.planName}</h1>
        <Link
          to="/assinar/$plano"
          params={{ plano: outro }}
          className="text-sm font-medium text-primary underline"
        >
          Ver o {outro === "premium_anual" ? "Premium Anual" : "Premium Mensal"}
        </Link>
      </div>

      {/* O bloco que o cliente precisa ler antes de pagar. */}
      <Card className={annual ? "border-primary/60 ring-1 ring-primary/20" : ""}>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {annual && (
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary text-primary-foreground">Melhor custo-benefício</Badge>
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              >
                Economize {summary.savingsPercentLabel}
              </Badge>
            </div>
          )}

          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Total a pagar hoje</p>
            <p className="text-3xl font-black text-primary sm:text-4xl" data-testid="total-hoje">
              {formatCents(summary.totalTodayCents)}
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted-foreground">Plano contratado</dt>
              <dd className="font-bold">{summary.planName}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted-foreground">Período de acesso</dt>
              <dd className="font-bold">{summary.accessPeriodLabel}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted-foreground">Valor da renovação</dt>
              <dd className="font-bold">
                {formatCents(summary.renewalAmountCents)}/{annual ? "ano" : "mês"}
              </dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted-foreground">Formas de pagamento</dt>
              <dd className="font-bold">Pix ou cartão de crédito, na InfinityPay</dd>
            </div>
          </dl>

          {annual && summary.lines.notMonthly && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              {summary.lines.notMonthly} Economia de {formatCents(summary.savingsCents ?? 0)} em
              comparação a 12 mensalidades do Premium Mensal.
            </p>
          )}

          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <p className="font-semibold">Renovação e cancelamento</p>
            <p className="text-muted-foreground">{summary.lines.renewal}</p>
            <p className="text-muted-foreground">{summary.lines.cancel}</p>
          </div>

          {current && <EfeitoNoPlanoAtual current={current} />}
        </CardContent>
      </Card>

      {!decision.ok ? (
        <Aviso titulo="Contratação indisponível para esta loja" texto={decision.message}>
          <Button asChild variant="outline" className="mt-3 h-11">
            <Link to="/billing">Ver meu plano</Link>
          </Button>
        </Aviso>
      ) : !offer.gatewayReady ? (
        <Aviso
          titulo="Pagamento online indisponível"
          texto="O pagamento online ainda não está configurado. Fale com a equipe da FlyControl para contratar."
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
                aria-label="Confirmo que li o valor, o período e a regra de renovação"
              />
              <span>
                Li e concordo: vou pagar <strong>{formatCents(summary.totalTodayCents)}</strong>{" "}
                hoje pelo <strong>{summary.planName}</strong>, com acesso por{" "}
                <strong>{summary.accessPeriodLabel}</strong>. A renovação é uma nova cobrança de{" "}
                {formatCents(summary.renewalAmountCents)}, que só acontece se eu pagar.{" "}
                <Link to="/terms" className="text-primary underline">
                  Termos de uso
                </Link>
                .
              </span>
            </label>

            <Button
              className="h-12 w-full gap-2 text-base font-bold"
              disabled={!accepted || sending}
              onClick={() => void irParaPagamento()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              )}
              Ir para o pagamento seguro ({formatCents(summary.totalTodayCents)})
            </Button>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O pagamento é
              feito no ambiente da InfinityPay. A FlyControl não recebe nem guarda dados do seu
              cartão. O plano é liberado assim que a InfinityPay confirmar o pagamento — pagamento
              pendente ou recusado não libera.
            </p>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}

/** O que acontece com o plano de hoje quando o pagamento for confirmado. */
function EfeitoNoPlanoAtual({
  current,
}: {
  current: NonNullable<NonNullable<PremiumOffer>["current"]>;
}) {
  let texto: string | null = null;
  if (current.planCode === "cents" && current.status === "free_trial") {
    texto =
      "Hoje você está no período grátis do CENTS. Ele termina na confirmação do pagamento, sem nenhuma cobrança pelo período grátis.";
  } else if (current.planCode === "cents") {
    texto =
      "Hoje você está no CENTS. Na confirmação do pagamento, o ciclo do CENTS é encerrado: os pedidos válidos feitos até ali viram uma fatura própria do CENTS (só o que foi usado), e o Premium começa a contar a partir do pagamento.";
  } else if (current.status === "free_trial") {
    texto =
      "Hoje você está no período grátis do Premium Mensal. Ele termina na confirmação do pagamento, sem nenhuma cobrança por ele.";
  } else if (current.status === "pending_activation" || current.status === "pending_payment") {
    texto = "Sua assinatura ainda não foi paga. Este pagamento é o que ativa o plano.";
  }
  if (!texto) return null;
  return <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{texto}</p>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 md:p-8">
      <Link
        to="/billing"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Plano e cobrança
      </Link>
      {children}
    </div>
  );
}

function Aviso({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="flex gap-3 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold">{titulo}</p>
          <p className="text-muted-foreground">{texto}</p>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

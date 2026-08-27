/**
 * Retorno do checkout da InfinityPay.
 *
 * São duas URLs, uma por plano — /pagamento/premium e /pagamento/cents — e é
 * isso que se cola no painel da InfinityPay como link de retorno de cada
 * checkout. Ter uma por plano permite recusar quem pagou um plano e voltou
 * pela URL do outro.
 *
 * A página não decide sozinha que houve pagamento: ela apresenta o token de
 * intenção guardado no navegador quando o cliente foi mandado ao checkout, e
 * o servidor decide o que fazer com isso.
 */

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CHECKOUT_TOKEN_STORAGE_KEY } from "@/lib/billing/checkout";
import { confirmCheckoutReturn, type ConfirmReturnResult } from "@/lib/billing/checkout.functions";
import { PLAN_PRICING, isKnownPlanCode, type PlanCode } from "@/lib/billing/plans";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/pagamento/$plano")({ component: CheckoutReturnPage });

/** Lê o token guardado antes do redirecionamento ao checkout. */
function readStoredToken(): { token: string; planCode: string } | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; planCode?: unknown };
    if (typeof parsed.token !== "string" || typeof parsed.planCode !== "string") return null;
    return { token: parsed.token, planCode: parsed.planCode };
  } catch {
    // Conteúdo corrompido é o mesmo que ausente.
    return null;
  }
}

type PageState =
  { phase: "loading" } | { phase: "invalid_plan" } | { phase: "done"; result: ConfirmReturnResult };

function CheckoutReturnPage() {
  const { plano } = useParams({ from: "/pagamento/$plano" });
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    if (!isKnownPlanCode(plano)) {
      setState({ phase: "invalid_plan" });
      return;
    }

    const stored = readStoredToken();
    if (!stored) {
      setState({
        phase: "done",
        result: {
          recognized: false,
          code: "not_found",
          message: "Não encontramos o registro deste checkout neste navegador.",
        },
      });
      return;
    }

    let active = true;
    void confirmCheckoutReturn({ data: { token: stored.token, planCode: plano } })
      .then((result) => {
        if (!active) return;
        // O token é de uso único. Mantê-lo depois da resposta só criaria
        // chance de reenvio ao recarregar a página.
        if (result.recognized) localStorage.removeItem(CHECKOUT_TOKEN_STORAGE_KEY);
        setState({ phase: "done", result });
      })
      .catch(() => {
        if (!active) return;
        setState({
          phase: "done",
          result: {
            recognized: false,
            code: "unavailable",
            message: "Não foi possível confirmar agora. Fale com a equipe da FlyControl.",
          },
        });
      });

    return () => {
      active = false;
    };
  }, [plano]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 p-6 text-center">
          <img src={logo} alt="FlyControl" className="mx-auto h-9 w-auto" />

          {state.phase === "loading" && <LoadingState />}
          {state.phase === "invalid_plan" && <InvalidPlanState />}
          {state.phase === "done" && <ResultState result={state.result} />}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 py-6">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Confirmando seu pagamento…</p>
    </div>
  );
}

function InvalidPlanState() {
  return (
    <div className="space-y-4">
      <StatusIcon tone="warning">
        <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      </StatusIcon>
      <div className="space-y-1">
        <h1 className="text-xl font-black">Endereço não reconhecido</h1>
        <p className="text-sm text-muted-foreground">
          Este link de retorno não corresponde a nenhum plano.
        </p>
      </div>
      <Button asChild className="h-12 w-full">
        <Link to="/plans">Ver os planos</Link>
      </Button>
    </div>
  );
}

function ResultState({ result }: { result: ConfirmReturnResult }) {
  if (!result.recognized) {
    return (
      <div className="space-y-4">
        <StatusIcon tone="warning">
          <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </StatusIcon>

        <div className="space-y-1">
          <h1 className="text-xl font-black">Não conseguimos confirmar automaticamente</h1>
          <p className="text-sm text-muted-foreground">{result.message}</p>
        </div>

        <p className="rounded-lg border border-border bg-muted/30 p-3 text-left text-sm text-muted-foreground">
          Se você concluiu o pagamento, ele não se perdeu. Isso acontece quando o retorno chega em
          outro navegador ou depois do prazo. Fale com a equipe da FlyControl com o comprovante que
          a ativação é feita manualmente.
        </p>

        <div className="flex flex-col gap-2">
          <Button asChild className="h-12 w-full">
            <Link to="/login">Entrar no painel</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/plans">Ver os planos</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pricing = PLAN_PRICING[result.planCode];

  return (
    <div className="space-y-5">
      <StatusIcon tone={result.activated ? "success" : "pending"}>
        {result.activated ? (
          <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <Clock className="h-7 w-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        )}
      </StatusIcon>

      <div className="space-y-1">
        <h1 className="text-xl font-black">
          {result.activated ? "Pagamento confirmado!" : "Recebemos seu retorno do pagamento"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {result.companyName} · plano {pricing.name}
        </p>
      </div>

      {result.activated ? (
        <p className="text-sm text-muted-foreground">{nextStepCopy(result.planCode)}</p>
      ) : (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-left text-sm text-muted-foreground">
          Seu pagamento está em conferência. Assim que ele for confirmado, o acesso completo é
          liberado — normalmente em poucos minutos no horário comercial. Você já pode entrar no
          painel e começar a configurar seu estabelecimento.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button asChild className="h-12 w-full">
          <Link to="/login">
            Continuar o cadastro <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** O que vem depois muda com o plano contratado. */
function nextStepCopy(planCode: PlanCode): string {
  if (planCode === "premium") {
    return "Seu acesso está liberado. Entre no painel para concluir a configuração do estabelecimento e começar a receber pedidos.";
  }
  if (planCode === "cents") {
    // Só chega aqui quem começou o cadastro quando ainda existia taxa de
    // entrada no CENTS. Cadastro novo não passa mais por esta tela.
    return "Seu acesso está liberado. Entre no painel para cadastrar seu estabelecimento e o cardápio — a partir daí você paga apenas pelos pedidos válidos.";
  }
  return "Pagamento de teste confirmado. Entre no painel para conferir o fluxo completo de cadastro e checkout.";
}

function StatusIcon({
  tone,
  children,
}: {
  tone: "success" | "pending" | "warning";
  children: React.ReactNode;
}) {
  const background =
    tone === "success"
      ? "bg-emerald-500/15"
      : tone === "pending"
        ? "bg-sky-500/15"
        : "bg-amber-500/15";

  return (
    <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${background}`}>
      {children}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Gift,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { GoogleIcon } from "@/components/GoogleIcon";
import { CHECKOUT_TOKEN_STORAGE_KEY } from "@/lib/billing/checkout";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING, isKnownPlanCode, type PlanCode } from "@/lib/billing/plans";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { TERMS_VERSION } from "@/lib/legal/terms";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_CODE,
  buildTrialTimeline,
  formatTrialDate,
} from "@/lib/billing/trial";
import { createAccount } from "@/lib/signup/signup.functions";
import {
  BRAZILIAN_STATES,
  formatCEP,
  formatDocument,
  formatPhone,
  hasErrors,
  validateCompanyStep,
  validateOwnerStep,
  type CompanyData,
  type FieldErrors,
  type OwnerData,
} from "@/lib/signup/validation";
import logo from "@/assets/flycontrol-logo.png";

type SignupSearch = { plan: PlanCode | undefined; google?: "1" };

export const Route = createFileRoute("/signup")({
  component: SignupWizard,
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    // `isKnownPlanCode` e não `isPublicPlanCode`: o plano interno de teste só
    // é alcançável por quem já sabe a URL exata — não aparece no seletor.
    plan: isKnownPlanCode(search.plan as string) ? (search.plan as PlanCode) : undefined,
    // Marcado pelo retorno do login com Google (`/auth/callback`): esta tela
    // pula o pedido de senha porque a pessoa já provou quem é pelo Google.
    // Opcional de propósito: os outros links para /signup não precisam saber
    // que este parâmetro existe.
    google: search.google === "1" ? "1" : undefined,
  }),
});

const STEPS = ["Comece grátis", "Criar conta", "Estabelecimento", "Ativar"] as const;

/** Sobrevive à viagem de ida e volta ao Google — todo o resto do estado se perde. */
const GOOGLE_PENDING_PLAN_KEY = "fc_signup_google_plan";

const SEGMENTS = [
  "Pizzaria",
  "Hamburgueria",
  "Restaurante",
  "Lanchonete",
  "Açaí e sorvetes",
  "Padaria",
  "Bar",
  "Outro",
] as const;

const emptyOwner: OwnerData = {
  fullName: "",
  email: "",
  whatsapp: "",
  password: "",
  passwordConfirmation: "",
};

const emptyCompany: CompanyData = {
  name: "",
  tradeName: "",
  document: "",
  phone: "",
  segment: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
};

/** Campo com rótulo e erro logo abaixo, onde o olho já está. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function SignupWizard() {
  const { plan: planFromUrl, google: googleFlag } = Route.useSearch();
  const navigate = useNavigate();
  const { user: googleUser, signInWithGoogle } = useAuth();

  // Só é "cadastro pelo Google" quando a tela chegou com o sinal do callback
  // E existe mesmo uma sessão — sem a sessão não há token para provar nada.
  const isGoogleAuth = googleFlag === "1" && !!googleUser;

  const [step, setStep] = useState(0);
  // Cadastro novo entra no CENTS: é o plano que combina com "pague só depois
  // de usar". O PREMIUM continua existindo e é oferecido dentro do painel; o
  // parâmetro `?plan=` na URL segue funcionando para links antigos e para o
  // plano interno de teste.
  const [planCode, setPlanCode] = useState<PlanCode>(planFromUrl ?? TRIAL_PLAN_CODE);
  // Os dados vivem no wizard inteiro: voltar uma etapa nunca apaga o que já
  // foi digitado.
  const [owner, setOwner] = useState<OwnerData>(emptyOwner);
  const [company, setCompany] = useState<CompanyData>(emptyCompany);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [result, setResult] = useState<{
    companyName: string;
    activationPending: boolean;
    /** Datas reais devolvidas pelo servidor. Nulo quando não houve trial. */
    trial: { startsAt: string; endsAt: string } | null;
    trialDenied: string | null;
    /**
     * `true` quando a conta já nasceu ativa sem ninguém pagar nada — o caso
     * do CENTS para quem não teve direito ao período grátis. Não há o que
     * cobrar para entrar, então não há por que segurar o acesso.
     */
    active: boolean;
    /** `true` quando já dá para entrar direto, sem passar pelo login. */
    signedIn: boolean;
  } | null>(null);

  // Nome, e-mail e foto (quando o Google devolve uma) vêm prontos da conta —
  // evita pedir de novo o que a pessoa já informou ao Google.
  useEffect(() => {
    if (!isGoogleAuth || !googleUser) return;
    const meta = (googleUser.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = String(meta.full_name ?? meta.name ?? "");
    setOwner((prev) => ({
      ...prev,
      fullName: prev.fullName || fullName,
      email: prev.email || googleUser.email || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGoogleAuth, googleUser?.id]);

  // Ir para o Google tira a pessoa desta página inteira — todo o estado do
  // React some. O plano escolhido é guardado aqui só para sobreviver a essa
  // viagem de ida e volta; some assim que é lido de volta.
  useEffect(() => {
    if (!isGoogleAuth) return;
    const pending = localStorage.getItem(GOOGLE_PENDING_PLAN_KEY);
    if (pending && isKnownPlanCode(pending)) setPlanCode(pending);
    // Quem volta do Google já passou pelo cartão de boas-vindas: mandá-lo de
    // volta para a etapa 0 faria a viagem parecer perdida.
    setStep(1);
    localStorage.removeItem(GOOGLE_PENDING_PLAN_KEY);
  }, [isGoogleAuth]);

  function onGoogleClick() {
    setGoogleLoading(true);
    localStorage.setItem(GOOGLE_PENDING_PLAN_KEY, planCode);
    void signInWithGoogle().then(({ error }) => {
      // Sem erro, o navegador já está saindo para o Google. Erro aqui só
      // acontece antes desse redirecionamento.
      if (error) {
        localStorage.removeItem(GOOGLE_PENDING_PLAN_KEY);
        setGoogleLoading(false);
        toast.error(error);
      }
    });
  }

  const pricing = PLAN_PRICING[planCode];

  function goNext() {
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      const found = validateOwnerStep(owner, { skipPassword: isGoogleAuth });
      setErrors(found);
      if (hasErrors(found)) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const found = validateCompanyStep(company);
      setErrors(found);
      if (hasErrors(found)) return;
      setStep(3);
    }
  }

  /**
   * Entra na conta recém-criada.
   *
   * Quem veio pelo Google já está com a sessão aberta; quem digitou senha
   * acabou de digitá-la aqui, então não há motivo para pedir de novo.
   */
  async function signInSilently(): Promise<boolean> {
    if (isGoogleAuth) return true;
    const { error } = await supabase.auth.signInWithPassword({
      email: owner.email.trim().toLowerCase(),
      password: owner.password,
    });
    if (error) console.error("[signup] login automático falhou:", error);
    return !error;
  }

  async function submit() {
    if (submitting) return;
    if (!acceptedTerms) {
      toast.error("É necessário aceitar os termos para continuar.");
      return;
    }
    setSubmitting(true);
    try {
      let googleAccessToken: string | undefined;
      if (isGoogleAuth) {
        const { data: sessionData } = await supabase.auth.getSession();
        googleAccessToken = sessionData.session?.access_token;
        if (!googleAccessToken) {
          toast.error("Sua sessão do Google expirou. Entre novamente.");
          setSubmitting(false);
          return;
        }
      }

      const created = await createAccount({
        // As versões que esta tela exibiu vão junto: é o que foi aceito de
        // fato. O servidor confere ambas contra as vigentes.
        data: {
          planCode,
          owner,
          company,
          acceptedTerms,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          googleAccessToken,
        },
      });
      // Checkout configurado: o cliente vai pagar agora. O token fica no
      // navegador para que o retorno possa ser amarrado a este cadastro — a
      // URL de retorno é a mesma para todos e, sozinha, não identifica
      // ninguém.
      if (created.checkout) {
        localStorage.setItem(
          CHECKOUT_TOKEN_STORAGE_KEY,
          JSON.stringify({ token: created.checkout.token, planCode }),
        );
        // `replace` e não `assign`: o botão "voltar" do checkout não deve
        // trazer o cliente para uma tela de cadastro já enviado.
        window.location.replace(created.checkout.url);
        return;
      }

      // Período gratuito liberado: a conta já está de pé. Entramos agora para
      // que a tela de conclusão termine em "Entrar no FlyControl" de verdade,
      // e não em mais um formulário de login.
      const jaAtiva = created.subscriptionStatus === "active";
      const signedIn = created.trial || jaAtiva ? await signInSilently() : false;

      setResult({
        companyName: created.companyName,
        activationPending: created.subscriptionStatus === "pending_activation",
        trial: created.trial,
        trialDenied: created.trialDenied,
        active: jaAtiva,
        signedIn,
      });
    } catch (err) {
      // A função do servidor já devolve mensagem em português e sem detalhe
      // técnico. Nada de "constraint violation" na tela — salvo no modo de
      // teste, que anexa o erro do banco de propósito.
      const message = err instanceof Error ? err.message : "Não foi possível concluir o cadastro.";
      console.error("[signup]", err);
      // Mensagem de diagnóstico é longa e precisa de tempo para ser lida.
      toast.error(message, { duration: message.length > 120 ? 30_000 : 5_000 });
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Etapa final A: período gratuito ativo ------------------------------
  if (result?.trial) {
    // As datas vêm do servidor. A tela apenas deriva as do ciclo seguinte a
    // partir do fim real do período — nunca recalcula o início.
    const timeline = buildTrialTimeline(new Date(result.trial.startsAt));
    const trialEnd = new Date(result.trial.endsAt);

    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4 py-8">
        <Card className="w-full max-w-lg overflow-hidden">
          <CardContent className="space-y-5 p-5 text-center sm:p-6">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
              <Check
                className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black sm:text-2xl">Seu FlyControl está ativo 🎉</h1>
              <p className="text-sm font-semibold text-primary">
                Seus próximos {TRIAL_DURATION_DAYS} dias são por nossa conta.
              </p>
              <p className="text-sm text-muted-foreground">{result.companyName}</p>
            </div>

            <dl className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Período grátis</dt>
                <dd className="text-right font-semibold">
                  {formatTrialDate(result.trial.startsAt)} até {formatTrialDate(trialEnd)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Ciclo cobrado começa em</dt>
                <dd className="text-right font-semibold">{formatTrialDate(trialEnd)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Ciclo cobrado termina em</dt>
                <dd className="text-right font-semibold">
                  {formatTrialDate(timeline.usageCycleEnd)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">Primeira cobrança prevista</dt>
                <dd className="text-right font-black text-primary">
                  {formatTrialDate(timeline.firstChargeAt)}
                </dd>
              </div>
            </dl>

            {/* Dizer quando NÃO se cobra é tão importante quanto dizer quanto
                custa: é o que evita a sensação de cobrança surpresa. */}
            <p className="rounded-lg bg-primary/5 p-3 text-left text-sm text-muted-foreground">
              Nada é cobrado agora nem durante os {TRIAL_DURATION_DAYS} dias. Depois disso,{" "}
              {planCode === "cents"
                ? `cada pedido válido passa a contar ${formatCents(pricing.defaultOrderUnitPriceCents)}`
                : `a mensalidade passa a ser ${formatCents(pricing.monthlyFeeCents)}`}
              , e a conta é fechada só no fim do ciclo — em{" "}
              {formatTrialDate(timeline.firstChargeAt)}.
            </p>

            <Button asChild className="h-12 w-full text-base font-bold">
              <Link to={result.signedIn ? "/dashboard" : "/login"}>Entrar no FlyControl</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Etapa final B: cadastro concluído, aguardando ativação -------------
  if (result) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-5 p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
              <Check
                className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black">Seu cadastro foi realizado.</h1>
              <p className="text-sm text-muted-foreground">{result.companyName}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Plano</span>
                <strong>{pricing?.name}</strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Cobrança</span>
                <strong className="text-right">
                  {pricing?.billingModel === "monthly_fixed"
                    ? `${formatCents(pricing.monthlyFeeCents)} por mês`
                    : `${formatCents(PLAN_PRICING.cents.defaultOrderUnitPriceCents)} por pedido, sem taxa de cadastro`}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Situação</span>
                {result.active ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" /> Conta liberada
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" /> Aguardando ativação
                  </Badge>
                )}
              </div>
            </div>

            {/* Motivo explícito quando o período grátis não valeu. Omitir
                deixaria o cliente achando que o sistema falhou, quando na
                verdade a regra é "um período grátis por pessoa". */}
            {result.trialDenied && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm text-amber-700 dark:text-amber-400">
                {result.trialDenied}
              </p>
            )}

            {/* Nada de dizer que a conta está ativa antes de estar. */}
            {result.active ? (
              <p className="text-sm text-muted-foreground">
                Não há nada a pagar para começar: sua conta já está liberada. A cobrança é apenas
                por pedido válido e a primeira conta fecha ao fim do ciclo.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Seu cadastro foi concluído e está aguardando ativação. A cobrança automática por PIX
                será disponibilizada na próxima etapa da integração; até lá, nossa equipe realiza a
                validação e a liberação do acesso.
              </p>
            )}

            <Button asChild className="h-12 w-full">
              <Link to={result.active && result.signedIn ? "/dashboard" : "/login"}>
                {result.active ? "Entrar no FlyControl" : "Voltar ao login"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-x border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/">
            <img src={logo} alt="FlyControl" className="h-8 w-auto" />
          </Link>
          <Button asChild variant="ghost" size="sm" className="h-11">
            <Link to="/login">Já tenho conta</Link>
          </Button>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* Indicador compacto no celular: números com barra, em vez de rótulos
            que não caberiam em 320px. */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-primary">
              Etapa {step + 1} de {STEPS.length}
            </span>
            <span className="text-muted-foreground">{STEPS[step]}</span>
          </div>
          <div
            className="flex gap-1.5"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label={`Etapa ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
          >
            {STEPS.map((label, index) => (
              <div
                key={label}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <section className="space-y-4">
            {/* Um cartão só, e ele domina a tela. Duas opções lado a lado
                transformavam a primeira decisão em uma conta de matemática —
                aqui a única decisão é "começar". O preço aparece embaixo,
                em letra menor e sem esconder nada. */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 text-center shadow-lg sm:p-8">
              {/* Brilho decorativo. `pointer-events-none` para nunca roubar o
                  toque do botão no celular. */}
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
                aria-hidden="true"
              />

              <Badge className="relative mb-4 gap-1.5 bg-primary px-3 py-1 text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Oferta de boas-vindas
              </Badge>

              <h1 className="relative text-4xl font-black leading-none tracking-tight sm:text-5xl">
                {TRIAL_DURATION_DAYS} DIAS
                <span className="block text-primary">GRÁTIS</span>
              </h1>

              <p className="relative mt-4 text-base font-semibold sm:text-lg">
                Comece agora. Pague só depois de usar.
              </p>

              <p className="relative mt-1 text-sm text-muted-foreground">
                R$ 0 nos primeiros {TRIAL_DURATION_DAYS} dias
              </p>

              <ul className="relative mx-auto mt-5 grid max-w-sm gap-2 text-left text-sm">
                {[
                  "Cardápio digital publicado automaticamente",
                  "Pedidos, entregas e financeiro no mesmo painel",
                  "Sem cartão de crédito para começar",
                  "Sem fidelidade: cancele quando quiser",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="relative mt-6 h-14 w-full text-base font-black tracking-wide transition-transform active:scale-[0.98]"
                onClick={goNext}
              >
                COMEÇAR GRÁTIS AGORA
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {/* O que acontece depois dos 30 dias, dito antes de começar. */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                Depois dos {TRIAL_DURATION_DAYS} dias
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Começa um ciclo em que cada pedido válido conta{" "}
                <strong className="text-foreground">
                  {formatCents(PLAN_PRICING.cents.defaultOrderUnitPriceCents)}
                </strong>
                . Ao atingir {PLAN_PRICING.cents.promotionThresholdOrders} pedidos em um ciclo, o
                próximo cai para{" "}
                <strong className="text-foreground">
                  {formatCents(PLAN_PRICING.cents.promotionalOrderUnitPriceCents)}
                </strong>{" "}
                por pedido. A conta é fechada só no fim do ciclo — nada é cobrado adiantado.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Não existe taxa de cadastro nem mensalidade:{" "}
                <strong className="text-foreground">você não paga nada para começar</strong> e a
                primeira conta só chega no fim do primeiro ciclo cobrado, com os pedidos que
                entraram.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <Link to="/plans" className="text-primary underline">
                  Ver todos os planos e o comparativo completo
                </Link>
              </p>
            </div>

            {!isGoogleAuth && (
              <>
                <div className="flex items-center gap-3 pt-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2"
                  onClick={onGoogleClick}
                  disabled={googleLoading}
                >
                  <GoogleIcon />
                  {googleLoading ? "Redirecionando..." : "Continuar com Google"}
                </Button>
              </>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <h1 className="text-xl font-bold sm:text-2xl">Seus dados</h1>

            {isGoogleAuth && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <GoogleIcon className="h-5 w-5 shrink-0" />
                <span className="text-muted-foreground">
                  Conectado com a conta Google{" "}
                  <strong className="text-foreground">{owner.email}</strong>
                </span>
              </div>
            )}

            <Field id="fullName" label="Nome completo" error={errors.fullName}>
              <Input
                id="fullName"
                className="h-11"
                autoComplete="name"
                value={owner.fullName}
                aria-invalid={!!errors.fullName}
                aria-describedby={errors.fullName ? "fullName-error" : undefined}
                onChange={(e) => setOwner({ ...owner, fullName: e.target.value })}
              />
            </Field>

            <Field id="email" label="E-mail" error={errors.email}>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                className="h-11"
                value={owner.email}
                disabled={isGoogleAuth}
                aria-invalid={!!errors.email}
                onChange={(e) => setOwner({ ...owner, email: e.target.value })}
              />
            </Field>

            <Field id="whatsapp" label="WhatsApp" error={errors.whatsapp}>
              <Input
                id="whatsapp"
                type="tel"
                inputMode="tel"
                className="h-11"
                placeholder="(11) 99999-0000"
                value={owner.whatsapp}
                aria-invalid={!!errors.whatsapp}
                onChange={(e) => setOwner({ ...owner, whatsapp: formatPhone(e.target.value) })}
              />
            </Field>

            {/* Quem entrou pelo Google já provou quem é por lá — pedir senha
                de novo aqui seria redundante, como pedir documento duas vezes
                na mesma portaria. */}
            {!isGoogleAuth && (
              <>
                <Field
                  id="password"
                  label="Senha"
                  error={errors.password}
                  hint="Ao menos 8 caracteres, com letra e número."
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="h-11"
                    value={owner.password}
                    aria-invalid={!!errors.password}
                    onChange={(e) => setOwner({ ...owner, password: e.target.value })}
                  />
                </Field>

                <Field
                  id="passwordConfirmation"
                  label="Confirmar senha"
                  error={errors.passwordConfirmation}
                >
                  <Input
                    id="passwordConfirmation"
                    type="password"
                    autoComplete="new-password"
                    className="h-11"
                    value={owner.passwordConfirmation}
                    aria-invalid={!!errors.passwordConfirmation}
                    onChange={(e) => setOwner({ ...owner, passwordConfirmation: e.target.value })}
                  />
                </Field>
              </>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Seu estabelecimento</h1>
              <p className="text-sm text-muted-foreground">
                Só o nome é obrigatório. O resto você completa depois.
              </p>
            </div>

            <Field id="companyName" label="Nome do estabelecimento" error={errors.name}>
              <Input
                id="companyName"
                className="h-11"
                value={company.name}
                aria-invalid={!!errors.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
              />
            </Field>

            <Field id="segment" label="Segmento">
              <select
                id="segment"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={company.segment}
                onChange={(e) => setCompany({ ...company, segment: e.target.value })}
              >
                <option value="">Selecione</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="document"
              label="CNPJ ou CPF"
              error={errors.document}
              hint="Opcional. Pode ser preenchido depois."
            >
              <Input
                id="document"
                inputMode="numeric"
                className="h-11"
                value={company.document}
                aria-invalid={!!errors.document}
                onChange={(e) =>
                  setCompany({ ...company, document: formatDocument(e.target.value) })
                }
              />
            </Field>

            <Field id="companyPhone" label="Telefone comercial" error={errors.phone}>
              <Input
                id="companyPhone"
                type="tel"
                inputMode="tel"
                className="h-11"
                value={company.phone}
                aria-invalid={!!errors.phone}
                onChange={(e) => setCompany({ ...company, phone: formatPhone(e.target.value) })}
              />
            </Field>

            <Field id="address" label="Endereço">
              <Input
                id="address"
                className="h-11"
                value={company.address}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
              />
            </Field>

            {/* Duas colunas a partir de sm; uma só no celular, para o rótulo
                nunca ficar espremido. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="city" label="Cidade">
                <Input
                  id="city"
                  className="h-11"
                  value={company.city}
                  onChange={(e) => setCompany({ ...company, city: e.target.value })}
                />
              </Field>

              <Field id="state" label="Estado" error={errors.state}>
                <select
                  id="state"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={company.state}
                  onChange={(e) => setCompany({ ...company, state: e.target.value })}
                >
                  <option value="">UF</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field id="zipCode" label="CEP" error={errors.zipCode}>
              <Input
                id="zipCode"
                inputMode="numeric"
                className="h-11"
                value={company.zipCode}
                aria-invalid={!!errors.zipCode}
                onChange={(e) => setCompany({ ...company, zipCode: formatCEP(e.target.value) })}
              />
            </Field>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h1 className="text-xl font-bold sm:text-2xl">Ativar seu período grátis</h1>

            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="space-y-3 p-4 text-sm">
                <h2 className="flex items-center gap-2 text-base font-black">
                  <Gift className="h-5 w-5 text-primary" aria-hidden="true" />
                  {TRIAL_DURATION_DAYS} dias grátis
                </h2>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Hoje você paga</span>
                  <strong className="text-primary">{formatCents(0)}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Nos {TRIAL_DURATION_DAYS} dias</span>
                  <strong className="text-primary">{formatCents(0)}</strong>
                </div>
                {pricing.billingModel === "monthly_fixed" ? (
                  <div className="flex justify-between gap-2 border-t border-primary/20 pt-2">
                    <span className="text-muted-foreground">Depois disso</span>
                    <strong>{formatCents(pricing.monthlyFeeCents)} por mês</strong>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between gap-2 border-t border-primary/20 pt-2">
                      <span className="text-muted-foreground">Depois disso, por pedido válido</span>
                      <strong>{formatCents(pricing.defaultOrderUnitPriceCents)}</strong>
                    </div>
                    <p className="rounded-md bg-background/60 p-2 text-xs text-muted-foreground">
                      A partir do fim do período grátis, ao atingir{" "}
                      {pricing.promotionThresholdOrders} pedidos válidos em um ciclo, o próximo
                      passa a custar {formatCents(pricing.promotionalOrderUnitPriceCents)} por
                      pedido. Para manter, é preciso atingir a meta em cada ciclo. A cobrança sai só
                      no fechamento do ciclo.
                      {pricing.setupFeeCents > 0 &&
                        ` A taxa única de cadastro de ${formatCents(pricing.setupFeeCents)} entra nessa primeira conta, e em nenhuma outra.`}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Não inclui Mesas, Garçons e Comissões — recursos do PREMIUM, que você pode
                      conhecer dentro do painel.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Responsável
                </h2>
                <p className="font-medium">{owner.fullName}</p>
                <p className="text-muted-foreground">{owner.email}</p>
                <p className="text-muted-foreground">{owner.whatsapp}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Estabelecimento
                </h2>
                <p className="font-medium">{company.name}</p>
                {company.segment && <p className="text-muted-foreground">{company.segment}</p>}
                {company.document && <p className="text-muted-foreground">{company.document}</p>}
                {(company.city || company.state) && (
                  <p className="text-muted-foreground">
                    {[company.city, company.state].filter(Boolean).join(" — ")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Os links ficam acima da caixinha, e não dentro do rótulo: um
                link dentro de um <label> clicável faz o toque abrir o
                documento ou marcar o aceite dependendo de milímetros — no
                celular, marcar sem querer é o resultado mais provável. Abrem
                em nova aba para não descartar o que já foi preenchido. */}
            <div className="flex flex-col gap-2 text-sm">
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 font-medium text-primary underline underline-offset-4"
              >
                Ler os termos de uso e as condições comerciais
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(abre em nova aba)</span>
              </Link>
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 font-medium text-primary underline underline-offset-4"
              >
                Ler a política de privacidade
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(abre em nova aba)</span>
              </Link>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>
                Li e aceito os termos de uso (versão {TERMS_VERSION}), a política de privacidade
                (versão {PRIVACY_VERSION}) e as condições comerciais do plano escolhido.
              </span>
            </label>
          </section>
        )}

        {/* A etapa 0 tem o próprio botão dentro do cartão: repetir aqui daria
            dois "continuar" na mesma tela. */}
        {step > 0 && (
          <div className="mt-6 flex gap-2">
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => {
                setErrors({});
                setStep(step - 1);
              }}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
            </Button>

            {step < 3 ? (
              <Button className="h-12 flex-1" onClick={goNext}>
                Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                className="h-12 flex-[2] font-bold"
                onClick={() => void submit()}
                disabled={submitting || !acceptedTerms}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitting ? "Ativando…" : `Ativar meus ${TRIAL_DURATION_DAYS} dias grátis`}
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

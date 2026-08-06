import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { CHECKOUT_TOKEN_STORAGE_KEY } from "@/lib/billing/checkout";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING, isPublicPlanCode, type PlanCode } from "@/lib/billing/plans";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { createAccount, getSignupOptions } from "@/lib/signup/signup.functions";
import { PAYMENT_BYPASS_WARNING } from "@/lib/signup/paymentBypass";
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

export const Route = createFileRoute("/signup")({
  component: SignupWizard,
  validateSearch: (search: Record<string, unknown>) => ({
    plan: isPublicPlanCode(search.plan as string) ? (search.plan as PlanCode) : undefined,
  }),
});

const STEPS = ["Plano", "Responsável", "Empresa", "Revisão"] as const;

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
  const { plan: planFromUrl } = Route.useSearch();
  const navigate = useNavigate();

  const [step, setStep] = useState(planFromUrl ? 1 : 0);
  const [planCode, setPlanCode] = useState<PlanCode | null>(planFromUrl ?? null);
  // Os dados vivem no wizard inteiro: voltar uma etapa nunca apaga o que já
  // foi digitado.
  const [owner, setOwner] = useState<OwnerData>(emptyOwner);
  const [company, setCompany] = useState<CompanyData>(emptyCompany);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ companyName: string; activationPending: boolean } | null>(
    null,
  );

  // Atalho de teste. Quem responde se ele existe é o servidor — o navegador
  // não enxerga variável de ambiente do Worker.
  const [bypassAllowed, setBypassAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    void getSignupOptions()
      .then((options) => active && setBypassAllowed(options.paymentBypassAllowed))
      .catch(() => {
        // Sem resposta, o atalho simplesmente não aparece.
      });
    return () => {
      active = false;
    };
  }, []);

  const pricing = planCode ? PLAN_PRICING[planCode] : null;

  function goNext() {
    if (step === 0) {
      if (!planCode) {
        toast.error("Escolha um plano para continuar.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      const found = validateOwnerStep(owner);
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

  async function submit(options: { bypassPayment?: boolean } = {}) {
    if (!planCode || submitting) return;
    if (!acceptedTerms) {
      toast.error("É necessário aceitar os termos para continuar.");
      return;
    }
    setSubmitting(true);
    try {
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
          bypassPayment: options.bypassPayment,
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

      // Atalho de teste: entra direto na configuração da loja, que é o que se
      // quer inspecionar. A senha acabou de ser digitada aqui, então não há
      // motivo para pedir de novo.
      if (created.paymentBypassed) {
        const { error } = await supabase.auth.signInWithPassword({
          email: owner.email.trim().toLowerCase(),
          password: owner.password,
        });

        if (!error) {
          await navigate({ to: "/my-store" });
          return;
        }
        // Login automático falhou: a conta existe, então cai na tela de
        // sucesso e o acesso é pelo login normal.
        console.error("[signup] login automático falhou:", error);
      }

      setResult({
        companyName: created.companyName,
        activationPending: created.subscriptionStatus === "pending_activation",
      });
    } catch (err) {
      // A função do servidor já devolve mensagem em português e sem detalhe
      // técnico. Nada de "constraint violation" na tela.
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Etapa final: cadastro concluído, aguardando ativação ---------------
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
                  {planCode === "premium"
                    ? `${formatCents(PLAN_PRICING.premium.monthlyFeeCents)} por mês`
                    : `${formatCents(PLAN_PRICING.cents.setupFeeCents)} de cadastro + ${formatCents(PLAN_PRICING.cents.defaultOrderUnitPriceCents)} por pedido`}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Situação</span>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <Clock className="h-3 w-3" aria-hidden="true" /> Aguardando ativação
                </Badge>
              </div>
            </div>

            {/* Nada de dizer que a conta está ativa antes de estar. */}
            <p className="text-sm text-muted-foreground">
              Seu cadastro foi concluído e está aguardando ativação. A cobrança automática por PIX
              será disponibilizada na próxima etapa da integração; até lá, nossa equipe realiza a
              validação e a liberação do acesso.
            </p>

            <Button asChild className="h-12 w-full">
              <Link to="/login">Voltar ao login</Link>
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
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Escolha seu plano</h1>
              <p className="text-sm text-muted-foreground">Você pode trocar depois.</p>
            </div>

            <div className="grid gap-3">
              {(["premium", "cents"] as const).map((code) => {
                const p = PLAN_PRICING[code];
                const selected = planCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setPlanCode(code)}
                    aria-pressed={selected}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-lg font-black">{p.name}</span>
                      {selected && (
                        <Badge className="bg-primary text-primary-foreground">Selecionado</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {code === "premium"
                        ? `${formatCents(p.monthlyFeeCents)}/mês`
                        : `${formatCents(p.setupFeeCents)} de cadastro + ${formatCents(p.defaultOrderUnitPriceCents)} por pedido`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                    {code === "cents" && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        Não inclui Mesas, Garçons e Comissões.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              <Link to="/plans" className="text-primary underline">
                Ver comparação completa
              </Link>
            </p>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <h1 className="text-xl font-bold sm:text-2xl">Seus dados</h1>

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

        {step === 3 && pricing && (
          <section className="space-y-4">
            <h1 className="text-xl font-bold sm:text-2xl">Confira antes de criar</h1>

            <Card>
              <CardContent className="space-y-3 p-4 text-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Plano {pricing.name}
                </h2>
                {planCode === "premium" ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Mensalidade</span>
                    <strong>{formatCents(pricing.monthlyFeeCents)}</strong>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Taxa única de cadastro</span>
                      <strong>{formatCents(pricing.setupFeeCents)}</strong>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Por pedido válido</span>
                      <strong>{formatCents(pricing.defaultOrderUnitPriceCents)}</strong>
                    </div>
                    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      Ao atingir {pricing.promotionThresholdOrders} pedidos válidos em um ciclo, o
                      próximo passa a custar {formatCents(pricing.promotionalOrderUnitPriceCents)}{" "}
                      por pedido. Para manter, é preciso atingir a meta em cada ciclo.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Não inclui Mesas, Garçons e Comissões.
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

        <div className="mt-6 flex gap-2">
          {step > 0 && (
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
          )}

          {step < 3 ? (
            <Button className="h-12 flex-1" onClick={goNext}>
              Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              className="h-12 flex-1"
              onClick={() => void submit()}
              disabled={submitting || !acceptedTerms}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? "Criando conta…" : "Criar minha conta"}
            </Button>
          )}
        </div>

        {/* TEMPORÁRIO — atalho de teste.
            Só aparece com SIGNUP_ALLOW_PAYMENT_BYPASS="true" no servidor, e o
            servidor reconfere: forjar a requisição não adianta. Sai junto com
            src/lib/signup/paymentBypass.ts quando a confirmação de pagamento
            da InfinityPay estiver ligada. */}
        {step === 3 && bypassAllowed && (
          <div className="mt-4 space-y-2 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 p-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{PAYMENT_BYPASS_WARNING}</span>
            </p>
            <Button
              variant="outline"
              className="h-11 w-full border-amber-500/60"
              onClick={() => void submit({ bypassPayment: true })}
              disabled={submitting || !acceptedTerms}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Criar conta sem pagamento e continuar
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

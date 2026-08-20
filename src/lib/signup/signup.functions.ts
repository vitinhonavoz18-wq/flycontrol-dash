/**
 * Criação de conta. Servidor apenas.
 *
 * O cadastro cria três coisas que precisam existir juntas: usuário
 * proprietário, empresa e assinatura. Fazer isso pelo navegador com
 * `auth.signUp` deixaria uma conta de autenticação órfã sempre que a criação
 * da empresa falhasse — e essa conta impede o usuário de tentar de novo com o
 * mesmo e-mail, sem que ele consiga entrar em lugar nenhum.
 *
 * Aqui a criação usa a service role e desfaz o que criou se algum passo
 * falhar. Postgres não dá transação através da API de auth, então a
 * compensação é explícita.
 */

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { COMPANY_BILLING_MODEL, isPublicPlanCode, type PlanCode } from "@/lib/billing/plans";
import {
  CHECKOUT_INTENT_TTL_MS,
  checkoutAmountCents,
  generateIntentToken,
  hashIntentToken,
  resolveCheckoutConfig,
} from "@/lib/billing/checkout";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { TRIAL_DENIAL_MESSAGES, grantFreeTrial } from "@/lib/billing/trial.server";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { PAYMENT_BYPASS_REASON, isPaymentBypassAllowed } from "./paymentBypass";
import { TERMS_VERSION } from "@/lib/legal/terms";
import {
  hasErrors,
  normalizeEmail,
  onlyDigits,
  slugify,
  validateCompanyStep,
  validateOwnerStep,
  type CompanyData,
  type OwnerData,
} from "./validation";

/** Postgres: relação inexistente — as migrations de cobrança não foram aplicadas. */
const UNDEFINED_TABLE = "42P01";

export type SignupInput = {
  planCode: string;
  owner: OwnerData;
  company: CompanyData;
  acceptedTerms: boolean;
  /** Versões dos documentos exibidas na tela em que o aceite foi dado. */
  termsVersion: string;
  privacyVersion: string;
  /** Atalho temporário de teste. Só vale se o servidor também permitir. */
  bypassPayment?: boolean;
};

export type SignupResult = {
  companyId: string;
  companyName: string;
  planCode: PlanCode;
  subscriptionStatus: "pending_activation" | "free_trial" | "active" | null;
  /**
   * Para onde mandar o cliente pagar, quando o checkout do plano está
   * configurado. Nulo mantém o fluxo anterior: cadastro concluído e ativação
   * combinada com a equipe.
   */
  checkout: { url: string; token: string } | null;
  /** `true` quando a conta foi criada pelo atalho de teste, sem pagamento. */
  paymentBypassed: boolean;
  /**
   * Datas reais do período gratuito, vindas do banco.
   *
   * A tela de conclusão mostra estas datas em vez de calcular as próprias: se
   * a tela calculasse, uma diferença de fuso ou um segundo de atraso faria o
   * cliente ler uma data e o sistema cobrar por outra.
   */
  trial: { startsAt: string; endsAt: string } | null;
  /**
   * Motivo, em português, de o período gratuito não ter sido liberado.
   * O caso normal é o e-mail ou o CNPJ já ter usado os 30 dias antes.
   */
  trialDenied: string | null;
};

/**
 * O que a tela de cadastro precisa saber sobre o ambiente.
 *
 * O botão de atalho não pode ser decidido pelo navegador: `import.meta.env`
 * do cliente não enxerga variável de servidor, e deixar a decisão no bundle
 * publicaria o atalho junto com o site.
 */
export const getSignupOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ paymentBypassAllowed: boolean }> => ({
    paymentBypassAllowed: isPaymentBypassAllowed(process.env),
  }),
);

/**
 * Cria a intenção de checkout e devolve o token que vai para o navegador.
 *
 * Nasce aqui, e não em um endpoint próprio, de propósito: um endpoint público
 * que recebesse um `companyId` deixaria qualquer um emitir token para empresa
 * alheia. Assim o token só existe para a empresa recém-criada nesta chamada.
 *
 * Falha aqui nunca derruba o cadastro — a conta já existe, e o pior caso é o
 * cliente ver a tela de "combine a ativação com a equipe".
 */
async function createCheckoutIntent(
  planCode: PlanCode,
  companyId: string,
  subscriptionId: string | null,
): Promise<{ url: string; token: string } | null> {
  const config = resolveCheckoutConfig(planCode, process.env);
  if (!config.configured) {
    console.info(`[signup] ${config.reason}`);
    return null;
  }

  try {
    const token = generateIntentToken();
    const tokenHash = await hashIntentToken(token);

    const { error } = await asBillingDb(supabaseAdmin)
      .from("checkout_intents")
      .insert({
        token_hash: tokenHash,
        company_id: companyId,
        subscription_id: subscriptionId,
        plan_code: planCode,
        // O valor vem da tabela de preços do servidor. O navegador não opina
        // sobre quanto custa.
        expected_amount_cents: checkoutAmountCents(planCode),
        checkout_url: config.url,
        expires_at: new Date(Date.now() + CHECKOUT_INTENT_TTL_MS).toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[signup] falha ao registrar intenção de checkout:", error);
      return null;
    }

    return { url: config.url, token };
  } catch (err) {
    console.error("[signup] erro ao criar intenção de checkout:", err);
    return null;
  }
}

/** Slug único: acrescenta sufixo curto enquanto houver colisão. */
async function reserveSlug(base: string): Promise<string> {
  const seed = base || `loja-${Date.now()}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? seed : `${seed}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await supabaseAdmin
      .from("pizzerias")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${seed}-${Date.now()}`;
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "fc_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Anexa o erro do banco à mensagem, apenas no modo de teste.
 *
 * A mensagem em português é a certa para quem está se cadastrando: código de
 * constraint e nome de coluna não ajudam o cliente e revelam a estrutura do
 * banco. Mas no atalho de teste é justamente esse detalhe que se quer ver — e
 * sem ele a única forma de descobrir a causa é abrir o log do servidor, o que
 * transforma um erro de uma linha em uma investigação.
 */
function withDiagnostics(message: string, error: unknown, testMode: boolean): string {
  if (!testMode || !error) return message;

  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const parts = [e.code, e.message, e.details, e.hint].filter(Boolean);
  return parts.length > 0 ? `${message}\n\n[modo de teste] ${parts.join(" · ")}` : message;
}

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((d: SignupInput) => {
    if (!isPublicPlanCode(d?.planCode)) throw new Error("Selecione um plano válido.");
    if (!d?.acceptedTerms) throw new Error("É necessário aceitar os termos para continuar.");

    // Aba aberta antes de uma publicação nova: o cliente aceitou um texto que
    // não é mais o vigente. Registrar como se fosse tornaria o consentimento
    // inútil justamente no caso em que ele importa.
    if (d.termsVersion !== TERMS_VERSION || d.privacyVersion !== PRIVACY_VERSION) {
      throw new Error(
        "Os documentos foram atualizados. Recarregue a página e revise antes de aceitar.",
      );
    }

    // A validação do cliente é conveniência; esta é a que decide. Um payload
    // montado à mão não passa por aqui.
    if (hasErrors(validateOwnerStep(d.owner))) throw new Error("Revise os dados do responsável.");
    if (hasErrors(validateCompanyStep(d.company))) throw new Error("Revise os dados da empresa.");
    return d;
  })
  .handler(async ({ data }): Promise<SignupResult> => {
    const planCode = data.planCode as PlanCode;
    const email = normalizeEmail(data.owner.email);

    // O pedido do navegador não decide nada: quem autoriza o atalho é o
    // ambiente. Uma requisição forjada com bypassPayment: true cai aqui e
    // segue pelo fluxo normal, com pagamento.
    const bypassPayment = data.bypassPayment === true && isPaymentBypassAllowed(process.env);
    if (data.bypassPayment === true && !bypassPayment) {
      console.warn("[signup] atalho de pagamento pedido, mas desligado no ambiente. Ignorado.");
    }

    // ---- 1. Usuário proprietário ------------------------------------------
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.owner.password,
      // Sem fluxo de e-mail configurado, exigir confirmação deixaria o
      // usuário sem conseguir entrar depois de pagar.
      email_confirm: true,
      user_metadata: {
        full_name: data.owner.fullName.trim(),
        whatsapp: onlyDigits(data.owner.whatsapp),
      },
    });

    if (authError || !created?.user) {
      const message = String(authError?.message ?? "");
      if (/already|exists|registered/i.test(message)) {
        throw new Error("Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.");
      }
      // A mensagem crua do provedor de auth não é para o usuário final.
      console.error("[signup] falha ao criar usuário:", authError);
      throw new Error("Não foi possível criar sua conta. Tente novamente em instantes.");
    }

    const userId = created.user.id;
    let companyId: string | null = null;

    /** Desfaz o que já foi criado. Ordem inversa da criação. */
    const rollback = async (reason: string) => {
      console.error(`[signup] rollback (${reason}) para o usuário ${userId}`);
      if (companyId) {
        await supabaseAdmin.from("pizzerias").delete().eq("id", companyId);
      }
      await supabaseAdmin.auth.admin.deleteUser(userId);
    };

    try {
      // ---- 2. Empresa -----------------------------------------------------
      const slug = await reserveSlug(slugify(data.company.name));

      const { data: company, error: companyError } = await supabaseAdmin
        .from("pizzerias")
        .insert({
          name: data.company.name.trim(),
          slug,
          owner_id: userId,
          api_key: generateApiKey(),
          status: "active",
          // O plano já vale para os entitlements desde a criação: uma conta
          // CENTS não enxerga Mesas nem antes da ativação da cobrança.
          plan_type: planCode,
          // O banco exige o par plan_type + billing_model. Sem esta linha a
          // coluna cai no default 'fixed' e todo cadastro no CENTS é recusado.
          billing_model: COMPANY_BILLING_MODEL[planCode],
          // A assinatura ainda não foi ativada, e a empresa não deve operar
          // como se tivesse sido. O atalho de teste é a exceção: ele existe
          // justamente para chegar ao que vem depois do pagamento.
          subscription_status: bypassPayment ? "active" : "pending_activation",
          phone: onlyDigits(data.company.phone) || null,
          address:
            [data.company.address, data.company.city, data.company.state]
              .filter(Boolean)
              .join(", ") || null,
        })
        .select("id, name")
        .single();

      if (companyError || !company) {
        console.error("[signup] falha ao criar empresa:", companyError);
        await rollback("empresa");
        throw new Error(
          withDiagnostics(
            "Não foi possível criar o estabelecimento. Tente novamente.",
            companyError,
            bypassPayment,
          ),
        );
      }

      companyId = company.id;

      // ---- 3. Assinatura --------------------------------------------------
      const db = asBillingDb(supabaseAdmin);

      const { data: plan, error: planError } = await db
        .from("plans")
        .select("id, billing_model")
        .eq("code", planCode)
        .eq("is_active", true)
        .maybeSingle();

      // Migrations de cobrança ainda não aplicadas: a conta e a empresa são
      // criadas do mesmo jeito, e a assinatura fica para o administrador. Sem
      // isso, o cadastro inteiro ficaria bloqueado por uma migration pendente.
      const planErrorCode = (planError as { code?: string } | null)?.code;
      if (planErrorCode === UNDEFINED_TABLE || !plan) {
        console.warn(
          "[signup] assinatura não criada: tabelas de cobrança ausentes ou plano inativo. " +
            `Empresa ${companyId} precisa de assinatura manual.`,
        );
        return {
          companyId,
          companyName: company.name,
          planCode,
          subscriptionStatus: null,
          // A empresa existe e o cliente pode pagar; a assinatura é criada
          // pelo administrador depois.
          checkout: bypassPayment ? null : await createCheckoutIntent(planCode, companyId, null),
          paymentBypassed: bypassPayment,
          trial: null,
          trialDenied: TRIAL_DENIAL_MESSAGES.billing_not_installed,
        };
      }

      const typedPlan = plan as { id: string; billing_model: string };

      const { data: priceVersion } = await db
        .from("plan_price_versions")
        .select("id")
        .eq("plan_id", typedPlan.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!priceVersion) {
        console.warn(`[signup] plano ${planCode} sem versão de preço ativa.`);
        return {
          companyId,
          companyName: company.name,
          planCode,
          subscriptionStatus: null,
          checkout: bypassPayment ? null : await createCheckoutIntent(planCode, companyId, null),
          paymentBypassed: bypassPayment,
          trial: null,
          trialDenied: TRIAL_DENIAL_MESSAGES.billing_not_installed,
        };
      }

      const { data: subscription, error: subError } = await db
        .from("subscriptions")
        .insert({
          company_id: companyId,
          plan_id: typedPlan.id,
          plan_price_version_id: (priceVersion as { id: string }).id,
          // Nunca nasce ativa. Sem gateway integrado, marcar como paga seria
          // inventar um pagamento que não existe — salvo no atalho de teste,
          // que é explicitamente um ambiente onde isso é aceito.
          status: bypassPayment ? "active" : "pending_activation",
          billing_model: typedPlan.billing_model,
          payment_provider: "manual",
          ...(bypassPayment && {
            activated_at: new Date().toISOString(),
            billing_anchor_day: new Date().getUTCDate(),
          }),
        })
        .select("id")
        .maybeSingle();

      if (subError || !subscription) {
        console.error("[signup] falha ao criar assinatura:", subError);
        await rollback("assinatura");
        throw new Error(
          withDiagnostics(
            "Não foi possível concluir o cadastro. Tente novamente.",
            subError,
            bypassPayment,
          ),
        );
      }

      await db.from("subscription_events").insert({
        subscription_id: (subscription as { id: string }).id,
        company_id: companyId,
        event_type: bypassPayment ? "subscription_created_test_bypass" : "subscription_created",
        new_status: bypassPayment ? "active" : "pending_activation",
        performed_by: userId,
        reason: bypassPayment ? PAYMENT_BYPASS_REASON : "Cadastro realizado pelo próprio cliente",
        metadata: {
          plan_code: planCode,
          // Registro do consentimento: sem a versão, uma alteração futura nos
          // termos tornaria impossível saber a que texto este cliente aceitou.
          accepted_terms_at: new Date().toISOString(),
          accepted_terms_version: TERMS_VERSION,
          accepted_privacy_version: PRIVACY_VERSION,
          // Marca permanente: esta conta nunca pagou. É o que permite
          // encontrá-las depois para limpar ou cobrar.
          payment_bypassed: bypassPayment,
        },
      });

      const subscriptionId = (subscription as { id: string }).id;

      // ---- 4. Período gratuito de 30 dias ---------------------------------
      // Quem concede é o banco. Aqui só pedimos e lemos a resposta — o
      // aplicativo não tem como dizer "pode" quando o banco disse "não".
      const trial = bypassPayment
        ? null
        : await grantFreeTrial({
            subscriptionId,
            ownerEmail: email,
            document: onlyDigits(data.company.document) || null,
          });

      if (trial?.granted) {
        // Conta ativa desde o primeiro minuto: o cardápio digital nasce junto,
        // porque prometer 30 dias e entregar um sistema pela metade seria pior
        // do que não prometer nada.
        await provisionAndForget(companyId);

        return {
          companyId,
          companyName: company.name,
          planCode,
          subscriptionStatus: "free_trial",
          // Ninguém paga nada agora. É esse o ponto do período gratuito.
          checkout: null,
          paymentBypassed: false,
          trial: { startsAt: trial.trialStartedAt, endsAt: trial.trialEndsAt },
          trialDenied: null,
        };
      }

      // O atalho de teste ativa a conta na hora, então o cardápio nasce junto
      // — é justamente o fluxo completo que se quer inspecionar.
      if (bypassPayment) await provisionAndForget(companyId);

      // Sem período gratuito (já usado antes, ou migration ainda não aplicada)
      // o cadastro segue pelo caminho antigo: pagamento primeiro.
      return {
        companyId,
        companyName: company.name,
        planCode,
        subscriptionStatus: bypassPayment ? "active" : "pending_activation",
        // No atalho não há para onde mandar pagar: é justamente o ponto dele.
        checkout: bypassPayment
          ? null
          : await createCheckoutIntent(planCode, companyId, subscriptionId),
        paymentBypassed: bypassPayment,
        trial: null,
        trialDenied: trial ? TRIAL_DENIAL_MESSAGES[trial.reason] : null,
      };
    } catch (err) {
      // Erro já tratado acima relança com mensagem própria; qualquer outro
      // ainda precisa desfazer o que foi criado.
      if (err instanceof Error && /Não foi possível/.test(err.message)) throw err;
      console.error("[signup] erro inesperado:", err);
      await rollback("inesperado");
      throw new Error(
        withDiagnostics(
          "Não foi possível concluir o cadastro. Tente novamente.",
          err instanceof Error ? { message: err.message } : err,
          bypassPayment,
        ),
      );
    }
  });

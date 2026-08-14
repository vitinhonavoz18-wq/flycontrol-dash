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
import {
  COMPANY_BILLING_MODEL,
  PLAN_PRICING,
  isKnownPlanCode,
  type PlanCode,
} from "@/lib/billing/plans";
import {
  CHECKOUT_INTENT_TTL_MS,
  checkoutAmountCents,
  checkoutReturnUrl,
  generateIntentToken,
  hashIntentToken,
  infinityPayWebhookUrl,
  resolveCheckoutConfig,
} from "@/lib/billing/checkout";
import { createInfinityPayCheckoutLink, infinityPayHandle } from "@/lib/billing/infinitypay/api";
import { openFirstCycle } from "@/lib/billing/activateSubscription.server";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { PAYMENT_BYPASS_REASON, isPaymentBypassAllowed } from "./paymentBypass";
import { checkAndRecordSignupAttempt, currentRequestIp } from "./rateLimit.server";
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
  /**
   * Presente quando quem está se cadastrando já entrou com o Google. O
   * `access_token` da sessão é conferido no servidor (nunca confiamos no que
   * o navegador diz sobre si mesmo); quando válido, o cadastro reaproveita
   * esse `auth.users.id` em vez de criar um usuário novo — evita duplicar
   * conta para quem já provou sua identidade pelo Google.
   */
  googleAccessToken?: string;
};

export type SignupResult = {
  companyId: string;
  companyName: string;
  planCode: PlanCode;
  subscriptionStatus: "pending_activation" | "active" | null;
  /**
   * Para onde mandar o cliente pagar, quando o checkout do plano está
   * configurado. Nulo mantém o fluxo anterior: cadastro concluído e ativação
   * combinada com a equipe.
   */
  checkout: { url: string; token: string } | null;
  /** `true` quando a conta foi criada pelo atalho de teste, sem pagamento. */
  paymentBypassed: boolean;
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
 * Grava a intenção de checkout. `id` explícito permite que o chamador saiba
 * o identificador antes da gravação — necessário para repassá-lo à
 * InfinityPay como `order_nsu` antes mesmo de a linha existir no banco.
 */
async function insertCheckoutIntent(params: {
  id?: string;
  tokenHash: string;
  companyId: string;
  subscriptionId: string | null;
  planCode: PlanCode;
  amountCents: number;
  checkoutUrl: string;
  expiresAt: string;
}): Promise<boolean> {
  const row: Record<string, unknown> = {
    token_hash: params.tokenHash,
    company_id: params.companyId,
    subscription_id: params.subscriptionId,
    plan_code: params.planCode,
    // O valor vem da tabela de preços do servidor. O navegador não opina
    // sobre quanto custa.
    expected_amount_cents: params.amountCents,
    checkout_url: params.checkoutUrl,
    expires_at: params.expiresAt,
  };
  if (params.id) row.id = params.id;

  try {
    const { error } = await asBillingDb(supabaseAdmin)
      .from("checkout_intents")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[signup] falha ao registrar intenção de checkout:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[signup] erro ao criar intenção de checkout:", err);
    return false;
  }
}

/**
 * Cria a intenção de checkout e devolve o token que vai para o navegador.
 *
 * Nasce aqui, e não em um endpoint próprio, de propósito: um endpoint público
 * que recebesse um `companyId` deixaria qualquer um emitir token para empresa
 * alheia. Assim o token só existe para a empresa recém-criada nesta chamada.
 *
 * Dois caminhos, nesta ordem:
 *
 * 1. Automático: com `INFINITYPAY_HANDLE` configurado, gera um link de
 *    pagamento novo para este cadastro, com o aviso de pagamento
 *    (`webhook_url`) já apontando para o nosso endpoint. É o que permite
 *    ativar a assinatura sozinho, sem depender de conferência manual.
 * 2. Manual (compatibilidade): sem a variável, cai no link fixo colado à mão
 *    no painel da InfinityPay — o fluxo original, que continua funcionando.
 *
 * Falha aqui nunca derruba o cadastro — a conta já existe, e o pior caso é o
 * cliente ver a tela de "combine a ativação com a equipe".
 */
async function createCheckoutIntent(
  planCode: PlanCode,
  companyId: string,
  subscriptionId: string | null,
): Promise<{ url: string; token: string } | null> {
  const amountCents = checkoutAmountCents(planCode);
  const token = generateIntentToken();
  const tokenHash = await hashIntentToken(token);
  const expiresAt = new Date(Date.now() + CHECKOUT_INTENT_TTL_MS).toISOString();
  const publicUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "");

  if (infinityPayHandle() && publicUrl) {
    const intentId = crypto.randomUUID();
    const link = await createInfinityPayCheckoutLink({
      orderNsu: intentId,
      amountCents,
      description: `FlyControl - plano ${PLAN_PRICING[planCode].name}`,
      redirectUrl: checkoutReturnUrl(publicUrl, planCode),
      webhookUrl: infinityPayWebhookUrl(publicUrl),
    });

    if (link.ok) {
      const inserted = await insertCheckoutIntent({
        id: intentId,
        tokenHash,
        companyId,
        subscriptionId,
        planCode,
        amountCents,
        checkoutUrl: link.url,
        expiresAt,
      });
      if (inserted) return { url: link.url, token };
      // Falhou ao gravar a intenção com o link já criado: cai para o modo
      // manual abaixo em vez de deixar o cliente sem para onde ir.
    } else {
      console.warn(`[signup] link dinâmico da InfinityPay indisponível: ${link.error}`);
    }
  }

  const config = resolveCheckoutConfig(planCode, process.env);
  if (!config.configured) {
    console.info(`[signup] ${config.reason}`);
    return null;
  }

  const inserted = await insertCheckoutIntent({
    tokenHash,
    companyId,
    subscriptionId,
    planCode,
    amountCents,
    checkoutUrl: config.url,
    expiresAt,
  });
  return inserted ? { url: config.url, token } : null;
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
    if (!isKnownPlanCode(d?.planCode)) throw new Error("Selecione um plano válido.");
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
    // montado à mão não passa por aqui. Quem chega pelo Google não digitou
    // senha nenhuma — não faz sentido cobrar isso aqui.
    if (hasErrors(validateOwnerStep(d.owner, { skipPassword: !!d.googleAccessToken }))) {
      throw new Error("Revise os dados do responsável.");
    }
    if (hasErrors(validateCompanyStep(d.company))) throw new Error("Revise os dados da empresa.");
    return d;
  })
  .handler(async ({ data }): Promise<SignupResult> => {
    // Antes de qualquer trabalho: barra scripts batendo cadastro sem parar,
    // cada tentativa gerando um link de pagamento real na InfinityPay.
    const ip = currentRequestIp();
    const { allowed } = await checkAndRecordSignupAttempt(ip);
    if (!allowed) {
      throw new Error("Muitas tentativas de cadastro. Aguarde um pouco e tente novamente.");
    }

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
    // Dois caminhos: quem já entrou com o Google traz uma identidade pronta
    // (é como já ter mostrado o documento na portaria — não se pede de novo);
    // quem não trouxe, cria a conta com e-mail e senha, como sempre foi.
    let userId: string;
    let createdFreshUser = false;

    if (data.googleAccessToken) {
      const { data: verified, error: verifyError } = await supabaseAdmin.auth.getUser(
        data.googleAccessToken,
      );
      if (verifyError || !verified?.user) {
        throw new Error("Sessão do Google expirada. Entre novamente.");
      }
      userId = verified.user.id;

      // Barreira final contra estabelecimento duplicado: se este usuário já
      // tem um, o cadastro não roda de novo — nem por um pedido forjado.
      const { data: existingCompany } = await supabaseAdmin
        .from("pizzerias")
        .select("id")
        .eq("owner_id", userId)
        .neq("status", "deleted")
        .neq("status", "inactive")
        .limit(1)
        .maybeSingle();
      if (existingCompany) {
        throw new Error("Você já tem um estabelecimento cadastrado. Acesse o painel.");
      }
    } else {
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
          throw new Error(
            "Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.",
          );
        }
        // A mensagem crua do provedor de auth não é para o usuário final.
        console.error("[signup] falha ao criar usuário:", authError);
        throw new Error("Não foi possível criar sua conta. Tente novamente em instantes.");
      }

      userId = created.user.id;
      createdFreshUser = true;
    }

    let companyId: string | null = null;

    /**
     * Desfaz o que já foi criado. Ordem inversa da criação.
     *
     * A conta de autenticação só é apagada quando foi criada aqui mesmo —
     * apagar o usuário do Google que já existia antes desta chamada tiraria
     * o acesso dele a tudo mais que já tinha, por um erro que nada tem a ver
     * com a conta dele.
     */
    const rollback = async (reason: string) => {
      console.error(`[signup] rollback (${reason}) para o usuário ${userId}`);
      if (companyId) {
        await supabaseAdmin.from("pizzerias").delete().eq("id", companyId);
      }
      if (createdFreshUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
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

      // O atalho de teste ativa a conta na hora, então o cardápio nasce junto
      // — é justamente o fluxo completo que se quer inspecionar. O ciclo de
      // cobrança abre junto, para o atalho reproduzir fielmente o que
      // acontece numa ativação de verdade.
      if (bypassPayment) {
        await openFirstCycle(db, (subscription as { id: string }).id);
        await provisionAndForget(companyId);
      }

      return {
        companyId,
        companyName: company.name,
        planCode,
        subscriptionStatus: bypassPayment ? "active" : "pending_activation",
        // No atalho não há para onde mandar pagar: é justamente o ponto dele.
        checkout: bypassPayment
          ? null
          : await createCheckoutIntent(planCode, companyId, (subscription as { id: string }).id),
        paymentBypassed: bypassPayment,
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

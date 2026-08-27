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
import { asBillingDb, type BillingDb } from "@/lib/billing/supabaseBridge";
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
  planRequiresUpfrontPayment,
  resolveCheckoutConfig,
} from "@/lib/billing/checkout";
import { openFirstCycle } from "@/lib/billing/activateSubscription.server";
import { pizzeriaAccessStatusFor } from "@/lib/billing/collections";
import { createInfinityPayCheckoutLink, infinityPayHandle } from "@/lib/billing/infinitypay/api";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { TRIAL_DENIAL_MESSAGES, grantFreeTrial } from "@/lib/billing/trial.server";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { isSignupDebugEnabled, withDiagnostics } from "./diagnostics";
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
  subscriptionStatus: "pending_activation" | "free_trial" | "active" | null;
  /**
   * Para onde mandar o cliente pagar, quando o checkout do plano está
   * configurado. Nulo mantém o fluxo anterior: cadastro concluído e ativação
   * combinada com a equipe.
   */
  checkout: { url: string; token: string } | null;
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

  // Plano sem nada a cobrar na entrada (o CENTS, hoje). Mandar alguém para
  // uma tela de pagamento de R$ 0,00 é pior do que não mandar: ele não
  // consegue pagar, não consegue voltar ativado, e fica achando que o
  // cadastro falhou. Quem chega aqui é ativado direto, sem checkout.
  if (amountCents <= 0) return null;
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

/**
 * Ativa a assinatura de um plano que não cobra nada para começar.
 *
 * É o mesmo destino a que o aviso de pagamento da InfinityPay leva: assinatura
 * ativa, ciclo de cobrança aberto e a loja liberada. A diferença é o motivo de
 * chegar lá — aqui não houve pagamento porque não havia o que pagar.
 *
 * O ciclo precisa ser aberto junto. Sem ele, a conta ficaria ativa recebendo
 * pedidos e não haveria onde lançar o consumo: é como abrir o restaurante sem
 * abrir a comanda — os pratos saem e ninguém anota nada para cobrar depois.
 */
async function activateWithoutPayment(
  db: BillingDb,
  companyId: string,
  subscriptionId: string,
  planCode: PlanCode,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  const { error } = await db
    .from("subscriptions")
    .update({
      status: "active",
      activated_at: nowIso,
      billing_anchor_day: new Date(nowIso).getUTCDate(),
      updated_at: nowIso,
    })
    .eq("id", subscriptionId);

  if (error) {
    console.error("[signup] falha ao ativar assinatura sem cobrança:", error);
    return false;
  }

  await db.from("subscription_events").insert({
    subscription_id: subscriptionId,
    company_id: companyId,
    event_type: "activated_without_charge",
    previous_status: "pending_activation",
    new_status: "active",
    reason: "Plano sem valor de entrada: nada a cobrar para liberar o acesso",
    metadata: { plan_code: planCode, upfront_amount_cents: 0 },
  });

  await openFirstCycle(db, subscriptionId);

  const { error: pizzeriaError } = await supabaseAdmin
    .from("pizzerias")
    .update({ subscription_status: pizzeriaAccessStatusFor("active") })
    .eq("id", companyId);

  if (pizzeriaError) {
    console.error("[signup] assinatura ativa mas loja não liberou:", pizzeriaError);
  }

  return true;
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

    // Detalhe técnico na mensagem de erro. Desligado por padrão; só muda o
    // texto do erro, nunca o que é criado.
    const showDetails = isSignupDebugEnabled(process.env);

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
          // como se tivesse sido. Quem muda isto é a liberação do período
          // gratuito ou a confirmação do pagamento — nunca o cadastro.
          subscription_status: "pending_activation",
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
            showDetails,
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
          checkout: await createCheckoutIntent(planCode, companyId, null),
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
          checkout: await createCheckoutIntent(planCode, companyId, null),
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
          // Nunca nasce ativa. Marcar como paga aqui seria inventar um
          // pagamento que não existe. Quem ativa é a liberação do período
          // gratuito, logo abaixo, ou a confirmação da InfinityPay.
          status: "pending_activation",
          billing_model: typedPlan.billing_model,
          payment_provider: "manual",
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
            showDetails,
          ),
        );
      }

      await db.from("subscription_events").insert({
        subscription_id: (subscription as { id: string }).id,
        company_id: companyId,
        event_type: "subscription_created",
        new_status: "pending_activation",
        performed_by: userId,
        reason: "Cadastro realizado pelo próprio cliente",
        metadata: {
          plan_code: planCode,
          // Registro do consentimento: sem a versão, uma alteração futura nos
          // termos tornaria impossível saber a que texto este cliente aceitou.
          accepted_terms_at: new Date().toISOString(),
          accepted_terms_version: TERMS_VERSION,
          accepted_privacy_version: PRIVACY_VERSION,
        },
      });

      const subscriptionId = (subscription as { id: string }).id;

      // ---- 4. Período gratuito de 30 dias ---------------------------------
      // Quem concede é o banco. Aqui só pedimos e lemos a resposta — o
      // aplicativo não tem como dizer "pode" quando o banco disse "não".
      const trial = await grantFreeTrial({
        subscriptionId,
        ownerEmail: email,
        document: onlyDigits(data.company.document) || null,
      });

      if (trial.granted) {
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
          trial: { startsAt: trial.trialStartedAt, endsAt: trial.trialEndsAt },
          trialDenied: null,
        };
      }

      // Sem período gratuito (já usado antes, ou migration ainda não aplicada).
      //
      // Aqui o caminho se abre em dois, e o que decide é se o plano tem algo a
      // cobrar na entrada:
      //
      // - PREMIUM cobra a mensalidade: vai para o checkout, como sempre foi.
      // - CENTS não cobra mais nada para começar. Não há o que pagar, então
      //   não há por que segurar a conta: ela nasce ativa e a cobrança só
      //   aparece no fim do ciclo, em cima dos pedidos que entraram.
      if (!planRequiresUpfrontPayment(planCode)) {
        const ativou = await activateWithoutPayment(db, companyId, subscriptionId, planCode);
        if (ativou) {
          await provisionAndForget(companyId);
          return {
            companyId,
            companyName: company.name,
            planCode,
            subscriptionStatus: "active",
            checkout: null,
            trial: null,
            trialDenied: TRIAL_DENIAL_MESSAGES[trial.reason],
          };
        }
        // Ativação falhou: melhor devolver "aguardando ativação" e deixar a
        // equipe concluir à mão do que dizer que está pronto sem estar.
      }

      return {
        companyId,
        companyName: company.name,
        planCode,
        subscriptionStatus: "pending_activation",
        checkout: await createCheckoutIntent(planCode, companyId, subscriptionId),
        trial: null,
        trialDenied: TRIAL_DENIAL_MESSAGES[trial.reason],
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
          showDetails,
        ),
      );
    }
  });

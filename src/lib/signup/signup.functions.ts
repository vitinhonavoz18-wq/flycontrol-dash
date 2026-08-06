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
import { isPublicPlanCode, type PlanCode } from "@/lib/billing/plans";
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
};

export type SignupResult = {
  companyId: string;
  companyName: string;
  planCode: PlanCode;
  subscriptionStatus: "pending_activation" | null;
};

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
    if (!isPublicPlanCode(d?.planCode)) throw new Error("Selecione um plano válido.");
    if (!d?.acceptedTerms) throw new Error("É necessário aceitar os termos para continuar.");

    // A validação do cliente é conveniência; esta é a que decide. Um payload
    // montado à mão não passa por aqui.
    if (hasErrors(validateOwnerStep(d.owner))) throw new Error("Revise os dados do responsável.");
    if (hasErrors(validateCompanyStep(d.company))) throw new Error("Revise os dados da empresa.");
    return d;
  })
  .handler(async ({ data }): Promise<SignupResult> => {
    const planCode = data.planCode as PlanCode;
    const email = normalizeEmail(data.owner.email);

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
          // A assinatura ainda não foi ativada, e a empresa não deve operar
          // como se tivesse sido.
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
        throw new Error("Não foi possível criar o estabelecimento. Tente novamente.");
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
        return { companyId, companyName: company.name, planCode, subscriptionStatus: null };
      }

      const { data: subscription, error: subError } = await db
        .from("subscriptions")
        .insert({
          company_id: companyId,
          plan_id: typedPlan.id,
          plan_price_version_id: (priceVersion as { id: string }).id,
          // Nunca nasce ativa. Sem gateway integrado, marcar como paga seria
          // inventar um pagamento que não existe.
          status: "pending_activation",
          billing_model: typedPlan.billing_model,
          payment_provider: "manual",
        })
        .select("id")
        .maybeSingle();

      if (subError || !subscription) {
        console.error("[signup] falha ao criar assinatura:", subError);
        await rollback("assinatura");
        throw new Error("Não foi possível concluir o cadastro. Tente novamente.");
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
          // Registro do consentimento. A versão dos documentos entra aqui
          // quando os textos oficiais existirem.
          accepted_terms_at: new Date().toISOString(),
        },
      });

      return {
        companyId,
        companyName: company.name,
        planCode,
        subscriptionStatus: "pending_activation",
      };
    } catch (err) {
      // Erro já tratado acima relança com mensagem própria; qualquer outro
      // ainda precisa desfazer o que foi criado.
      if (err instanceof Error && /Não foi possível/.test(err.message)) throw err;
      console.error("[signup] erro inesperado:", err);
      await rollback("inesperado");
      throw new Error("Não foi possível concluir o cadastro. Tente novamente.");
    }
  });

/**
 * Ações administrativas sobre assinaturas.
 *
 * Tudo aqui roda no servidor, atrás de `requireSupabaseAuth` e de uma
 * verificação de administrador global. O cliente não tem policy de escrita em
 * `subscriptions` — mudar plano ou status manipulando uma requisição do
 * navegador é impossível por construção, não por checagem de interface.
 *
 * Nenhuma alteração acontece sem registro em `subscription_events`: quem fez,
 * quando, de qual status para qual e por quê.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { initialUnitPriceCents } from "./billingEngine";
import { pizzeriaAccessStatusFor } from "./collections";
import { COMPANY_BILLING_MODEL, isPublicPlanCode, type PlanCode } from "./plans";
import { provisionAndForget } from "@/lib/provisioning/ensureProvisioned.server";
import { asBillingDb, type BillingDb } from "./supabaseBridge";
import { canTransition, isSubscriptionStatus, type SubscriptionStatus } from "./subscriptionStatus";

type Db = BillingDb;

/**
 * Só quem tem a chave daquela ação passa daqui.
 *
 * `tem_permissao()` é a mesma função que o banco usa, então a verificação da
 * aplicação e a do banco nunca divergem. Quem é super_admin responde sim a
 * qualquer chave — para o dono da plataforma nada muda.
 *
 * A chave que interessa aqui é `confirmar_pagamento`: ativar, suspender ou
 * reativar assinatura é o que liga e desliga o acesso de um cliente pagante.
 * Não é coisa para quem só responde chamado de suporte.
 */
async function assertPermissao(supabase: Db, permissao: string): Promise<void> {
  const { data: pode, error } = await supabase.rpc("tem_permissao", { p_permissao: permissao });
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!pode) {
    throw new Error(
      "Você não tem permissão para esta ação. Peça a liberação a um administrador da plataforma.",
    );
  }
}

type SubscriptionRow = {
  id: string;
  company_id: string;
  status: string;
  plan_id: string;
  billing_model: string;
  activated_at: string | null;
};

async function loadSubscription(supabase: Db, subscriptionId: string): Promise<SubscriptionRow> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, company_id, status, plan_id, billing_model, activated_at")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a assinatura.");
  if (!data) throw new Error("Assinatura não encontrada.");
  return data as SubscriptionRow;
}

async function recordEvent(
  supabase: Db,
  input: {
    subscriptionId: string;
    companyId: string;
    eventType: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    performedBy: string;
    reason: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("subscription_events").insert({
    subscription_id: input.subscriptionId,
    company_id: input.companyId,
    event_type: input.eventType,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    performed_by: input.performedBy,
    reason: input.reason,
    metadata: input.metadata ?? {},
  });
}

/**
 * Move a assinatura para outro status.
 *
 * A transição passa pela máquina de estados antes de tocar no banco, e a
 * gravação é condicional ao status atual — se outro administrador agiu no
 * intervalo, esta operação não sobrescreve a dele.
 */
export const changeSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string; targetStatus: string; reason?: string }) => {
    if (!d?.subscriptionId) throw new Error("Assinatura não informada.");
    if (!isSubscriptionStatus(d?.targetStatus)) throw new Error("Status de destino inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const supabase = asBillingDb(context.supabase);
    await assertPermissao(supabase, "confirmar_pagamento");

    const subscription = await loadSubscription(supabase, data.subscriptionId);
    const target = data.targetStatus as SubscriptionStatus;

    const check = canTransition(subscription.status, target);
    if (!check.allowed) throw new Error(check.reason);

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status: target, updated_at: now };

    // Carimbos de data por transição. `activated_at` só é gravado na primeira
    // ativação: reativar depois de uma suspensão não reescreve a data em que
    // a empresa entrou na plataforma.
    if (target === "active" && !subscription.activated_at) update.activated_at = now;
    if (target === "suspended") update.suspended_at = now;
    if (target === "canceled") update.canceled_at = now;

    const { data: updated, error } = await supabase
      .from("subscriptions")
      .update(update)
      .eq("id", subscription.id)
      .eq("status", subscription.status)
      .select("id");

    if (error) throw new Error("Não foi possível atualizar a assinatura.");
    if (!updated || (updated as unknown[]).length === 0) {
      throw new Error(
        "A assinatura foi alterada por outro administrador. Recarregue e tente novamente.",
      );
    }

    // O reflexo no campo que a porta de acesso confere de verdade. Sem isso,
    // "suspender" por aqui não bloqueia nada na prática — quem trancava o
    // acesso de verdade era só o painel antigo, que mexe direto nesta coluna.
    await supabase
      .from("pizzerias")
      .update({ subscription_status: pizzeriaAccessStatusFor(target) })
      .eq("id", subscription.company_id);

    await recordEvent(supabase, {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      eventType: target === "active" ? "manually_activated" : `status_changed_to_${target}`,
      previousStatus: subscription.status,
      newStatus: target,
      performedBy: context.userId,
      reason: data.reason?.trim() || null,
    });

    // Ativar sem ciclo aberto deixaria o consumo sem onde ser lançado: o
    // trigger de pedidos emite aviso e não registra nada. Abrir aqui é o que
    // fecha o circuito de cobrança.
    let cycleId: string | null = null;
    if (target === "active") {
      const { data: openedId, error: cycleError } = await supabase.rpc("open_billing_cycle", {
        p_subscription_id: subscription.id,
      });
      if (cycleError) {
        // A assinatura já está ativa; falhar aqui não deve desfazer isso.
        console.error("[billing] assinatura ativada mas ciclo não abriu:", cycleError);
      } else {
        cycleId = (openedId as string | null) ?? null;
      }

      // Ativação manual é hoje o caminho normal de conclusão do onboarding,
      // já que a confirmação automática da InfinityPay ainda não está ligada.
      // É aqui, portanto, que o cardápio precisa nascer.
      //
      // Esperamos terminar: promessa solta em Worker é descartada quando a
      // resposta sai. A chamada tem prazo de 20s e nunca lança.
      await provisionAndForget(subscription.company_id);
    }

    return { status: target, billingCycleId: cycleId };
  });

/**
 * Troca o plano da assinatura.
 *
 * Vale a partir do PRÓXIMO ciclo, por padrão: mudar o preço de um ciclo em
 * andamento alteraria uma cobrança que o cliente já começou a acumular. Não
 * há cálculo de rateio porque não existe regra comercial definida para ele.
 *
 * Nada é apagado no downgrade. Mesas, garçons e comissões continuam no banco,
 * apenas inacessíveis — voltar ao PREMIUM devolve os dados intactos.
 */
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string; planCode: string; reason?: string }) => {
    if (!d?.subscriptionId) throw new Error("Assinatura não informada.");
    if (!isPublicPlanCode(d?.planCode)) throw new Error("Plano inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const supabase = asBillingDb(context.supabase);
    await assertPermissao(supabase, "confirmar_pagamento");

    const subscription = await loadSubscription(supabase, data.subscriptionId);
    const planCode = data.planCode as PlanCode;

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, code, billing_model")
      .eq("code", planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !plan) throw new Error("Plano não encontrado ou inativo.");
    const typedPlan = plan as { id: string; code: string; billing_model: string };

    if (typedPlan.id === subscription.plan_id) {
      throw new Error("A assinatura já está neste plano.");
    }

    // A versão de preço vigente é congelada na assinatura: alterações futuras
    // de tabela não reescrevem o que foi contratado agora.
    const { data: priceVersion, error: priceError } = await supabase
      .from("plan_price_versions")
      .select("id, default_order_unit_price_cents")
      .eq("plan_id", typedPlan.id)
      .eq("is_active", true)
      .maybeSingle();

    if (priceError || !priceVersion) throw new Error("Este plano está sem versão de preço ativa.");
    const typedPrice = priceVersion as { id: string };

    const { data: updated, error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: typedPlan.id,
        plan_price_version_id: typedPrice.id,
        billing_model: typedPlan.billing_model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)
      .eq("plan_id", subscription.plan_id)
      .select("id");

    if (error) throw new Error("Não foi possível alterar o plano.");
    if (!updated || (updated as unknown[]).length === 0) {
      throw new Error(
        "O plano foi alterado por outro administrador. Recarregue e tente novamente.",
      );
    }

    // `pizzerias.plan_type` continua sendo o que os entitlements consultam.
    // Mantê-lo em sincronia é o que faz o bloqueio de Mesas/Garçons/Comissões
    // valer imediatamente, na interface e no plan-guard do servidor.
    //
    // `billing_model` vai junto por obrigação do banco: a constraint exige o
    // par correto, e atualizar só o plan_type faz a troca para o CENTS ser
    // recusada.
    const { error: companyError } = await supabase
      .from("pizzerias")
      .update({ plan_type: planCode, billing_model: COMPANY_BILLING_MODEL[planCode] })
      .eq("id", subscription.company_id);

    if (companyError) {
      // A assinatura já mudou de plano acima. Deixar a empresa para trás
      // significaria cobrar por um plano e liberar as telas de outro.
      console.error("[billing] falha ao sincronizar plano da empresa:", companyError);
      throw new Error(
        "O plano da assinatura foi alterado, mas as permissões da empresa não. " +
          "Avise o suporte antes de continuar.",
      );
    }

    await recordEvent(supabase, {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      eventType: "plan_changed",
      previousStatus: subscription.status,
      newStatus: subscription.status,
      performedBy: context.userId,
      reason: data.reason?.trim() || null,
      metadata: {
        previous_plan_id: subscription.plan_id,
        new_plan_id: typedPlan.id,
        new_plan_code: planCode,
        applies_to: "next_cycle",
        next_cycle_unit_price_cents: initialUnitPriceCents(planCode),
      },
    });

    return { planCode, appliesTo: "next_cycle" as const };
  });

/**
 * Cria a assinatura de uma empresa que ainda não tem.
 *
 * Nasce em `pending_activation`: sem gateway integrado, marcar como paga
 * seria inventar um pagamento que não existe. A ativação é ato administrativo
 * explícito e auditado.
 */
export const createSubscriptionForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; planCode: string }) => {
    if (!d?.companyId) throw new Error("Empresa não informada.");
    if (!isPublicPlanCode(d?.planCode)) throw new Error("Plano inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const supabase = asBillingDb(context.supabase);
    await assertPermissao(supabase, "confirmar_pagamento");

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("company_id", data.companyId)
      .not("status", "in", "(canceled,expired)")
      .maybeSingle();

    if (existing) throw new Error("Esta empresa já possui uma assinatura ativa ou pendente.");

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, code, billing_model")
      .eq("code", data.planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !plan) throw new Error("Plano não encontrado ou inativo.");
    const typedPlan = plan as { id: string; billing_model: string };

    const { data: priceVersion } = await supabase
      .from("plan_price_versions")
      .select("id")
      .eq("plan_id", typedPlan.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!priceVersion) throw new Error("Este plano está sem versão de preço ativa.");

    const { data: created, error } = await supabase
      .from("subscriptions")
      .insert({
        company_id: data.companyId,
        plan_id: typedPlan.id,
        plan_price_version_id: (priceVersion as { id: string }).id,
        status: "pending_activation",
        billing_model: typedPlan.billing_model,
        payment_provider: "manual",
      })
      .select("id")
      .maybeSingle();

    if (error || !created) throw new Error("Não foi possível criar a assinatura.");
    const subscriptionId = (created as { id: string }).id;

    await recordEvent(supabase, {
      subscriptionId,
      companyId: data.companyId,
      eventType: "subscription_created",
      newStatus: "pending_activation",
      performedBy: context.userId,
      reason: null,
      metadata: { plan_code: data.planCode },
    });

    return { subscriptionId, status: "pending_activation" as const };
  });

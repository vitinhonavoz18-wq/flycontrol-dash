import { planHasFeature, FEATURE_LABELS, type Feature } from "@/lib/planPermissions";
import { ADDON_LABELS, type Addon } from "@/lib/addons";

/**
 * Confere só o dono, sem exigir plano.
 *
 * Serve para as áreas liberadas em todos os planos — o Marketing é uma
 * delas hoje. A conferência de dono é a mesma de sempre e não é opcional:
 * o `tenantId` que chega do navegador é sempre tratado como um pedido, nunca
 * como uma verdade. É o porteiro conferindo o nome na lista em vez de
 * aceitar quem diz "pode deixar, eu sou convidado".
 */
export async function assertOwnsTenant(supabase: any, userId: string, tenantId: string) {
  if (!tenantId || typeof tenantId !== "string") throw new Error("Loja não informada");

  const { data, error } = await supabase
    .from("pizzerias")
    .select("id, owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Loja não encontrada");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (data.owner_id !== userId && !isAdmin) throw new Error("Acesso negado a esta loja");

  return { tenantId: data.id as string, isAdmin: Boolean(isAdmin) };
}

// Único ponto que server functions usam para validar dono + plano de uma
// empresa antes de liberar uma feature restrita (Mesas/Garçons/Comissões).
// Reaproveita a mesma tabela de permissões usada no client (planPermissions.ts)
// para que a regra nunca divirja entre UI e API.
export async function assertOwnsTenantWithFeature(
  supabase: any,
  userId: string,
  tenantId: string,
  feature: Feature
) {
  const { data, error } = await supabase
    .from("pizzerias")
    .select("id, owner_id, plan_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Loja não encontrada");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (data.owner_id !== userId && !isAdmin) throw new Error("Acesso negado a esta loja");

  if (!isAdmin && !planHasFeature(data.plan_type, feature)) {
    throw new Error(
      `Esta funcionalidade (${FEATURE_LABELS[feature]}) está disponível apenas para empresas do Plano Premium.`
    );
  }
}

/**
 * Dono + plano + CONTRATAÇÃO do recurso extra.
 *
 * É o porteiro do Chat. Três perguntas na porta, nesta ordem:
 *
 *   1. esta loja existe?
 *   2. quem está pedindo é o dono dela (ou um administrador)?
 *   3. esta loja contratou este recurso?
 *
 * As três valem MESMO QUE A TELA NÃO APAREÇA. Esconder a aba no painel é
 * decoração — quem digitar o endereço direto na barra bate aqui. Uma porta de
 * cinema escondida atrás da cortina continua sendo uma porta se estiver
 * destrancada.
 *
 * As mensagens de erro são de propósito diferentes entre "não é seu" e "não
 * contratou": a segunda é o que a tela usa para mostrar o caminho da
 * contratação, em vez de só dizer "não pode".
 */
export async function assertOwnsTenantWithAddon(
  supabase: any,
  userId: string,
  tenantId: string,
  feature: Feature,
  addon: Addon,
) {
  if (!tenantId || typeof tenantId !== "string") throw new Error("Loja não informada");

  const { data, error } = await supabase
    .from("pizzerias")
    .select("id, owner_id, plan_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Loja não encontrada");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  const admin = Boolean(isAdmin);
  if (data.owner_id !== userId && !admin) throw new Error("Acesso negado a esta loja");

  if (admin) return { tenantId: data.id as string, isAdmin: true };

  if (!planHasFeature(data.plan_type, feature)) {
    throw new Error(
      `Esta funcionalidade (${FEATURE_LABELS[feature]}) está disponível apenas para empresas do Plano Premium.`,
    );
  }

  const { data: contratos, error: erroAddon } = await supabase
    .from("company_addons")
    .select("addon")
    .eq("tenant_id", data.id)
    .eq("addon", addon)
    .eq("status", "active")
    .limit(1);

  // Falha ao consultar tranca a porta. Nunca o contrário: uma consulta que
  // falhou não é prova de que o cliente pagou.
  if (erroAddon) throw new Error("Não foi possível confirmar a contratação. Tente novamente.");

  if (!contratos || contratos.length === 0) {
    throw new Error(
      `O recurso ${ADDON_LABELS[addon]} ainda não está contratado para esta loja. Fale com o suporte para ativar.`,
    );
  }

  return { tenantId: data.id as string, isAdmin: false };
}

/** O texto que a tela usa para saber que o caso é "falta contratar". */
export const ERRO_ADDON_NAO_CONTRATADO = "ainda não está contratado";

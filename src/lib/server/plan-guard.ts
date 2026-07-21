import { planHasFeature, FEATURE_LABELS, type Feature } from "@/lib/planPermissions";

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

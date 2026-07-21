// Camada central de permissões por plano. Toda a aplicação (client e server)
// deve consultar hasFeature()/PLAN_FEATURES em vez de comparar `plan_type`
// diretamente — isso é o único lugar que sabe "quem pode o quê".
//
// Para adicionar um plano novo (Enterprise, Franquia, White Label...): basta
// acrescentar uma chave em PLAN_FEATURES. Para adicionar uma funcionalidade
// controlável: acrescentar ao union `Feature` e listá-la nos planos que a têm.

export type PlanType = "premium" | "cents";

export type Feature = "tables" | "waiters" | "commissions";

export const FEATURE_LABELS: Record<Feature, string> = {
  tables: "Mesas",
  waiters: "Garçons",
  commissions: "Comissões",
};

// Cada plano lista só as features restritas que ele desbloqueia. Qualquer
// feature que não apareça em nenhum union abaixo é considerada disponível
// para todos os planos por padrão (dashboard, cardápio, financeiro etc. não
// precisam ser listados aqui).
const PLAN_FEATURES: Record<PlanType, Feature[]> = {
  premium: ["tables", "waiters", "commissions"],
  cents: [],
};

const DEFAULT_PLAN: PlanType = "premium";

export function normalizePlanType(value: string | null | undefined): PlanType {
  return value === "cents" ? "cents" : DEFAULT_PLAN;
}

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  const normalized = normalizePlanType(plan);
  return PLAN_FEATURES[normalized].includes(feature);
}

export function featuresForPlan(plan: string | null | undefined): Feature[] {
  return PLAN_FEATURES[normalizePlanType(plan)];
}

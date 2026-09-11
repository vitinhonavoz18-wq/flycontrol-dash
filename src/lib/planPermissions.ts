// Camada central de permissões por plano. Toda a aplicação (client e server)
// deve consultar hasFeature()/PLAN_FEATURES em vez de comparar `plan_type`
// diretamente — isso é o único lugar que sabe "quem pode o quê".
//
// Para adicionar um plano novo (Enterprise, Franquia, White Label...): basta
// acrescentar uma chave em PLAN_FEATURES. Para adicionar uma funcionalidade
// controlável: acrescentar ao union `Feature` e listá-la nos planos que a têm.

/**
 * `legacy_full_access` é um plano INTERNO, não comercial.
 *
 * As empresas que já existiam antes do modelo de assinatura mantêm acesso
 * completo até que um administrador as migre. Sem ele, ligar a cobrança
 * bloquearia clientes em produção da noite para o dia.
 *
 * Ele nunca aparece na página pública: `PUBLIC_PLAN_CODES`, em
 * `lib/billing/plans.ts`, lista somente PREMIUM e CENTS.
 */
export type PlanType = "premium" | "cents" | "legacy_full_access";

export type Feature = "tables" | "waiters" | "commissions" | "chat";

export const FEATURE_LABELS: Record<Feature, string> = {
  tables: "Mesas",
  waiters: "Garçons",
  commissions: "Comissões",
  chat: "Chat (CRM)",
};

/**
 * Features que o PREMIUM mostra, mas NÃO inclui no preço.
 *
 * "Estar no plano" e "estar contratado" viraram duas perguntas diferentes a
 * partir do Chat. O plano decide se a aba APARECE; a contratação decide se
 * ela FUNCIONA. É a diferença entre o salão de festas do prédio — todo mundo
 * vê a porta, só quem reservou entra.
 *
 * Quem responde a segunda pergunta é `lib/addons.ts`. Esta lista existe para
 * que a tela de upgrade não prometa o que o upgrade não entrega: sem ela, o
 * CENTS leria "assine o PREMIUM e leve o Chat junto" — e ligaria cobrando
 * uma coisa que ainda precisa ser contratada à parte.
 */
export const FEATURES_CONTRATADAS_A_PARTE: Feature[] = ["chat"];

export function featureEhContratadaAParte(feature: Feature): boolean {
  return FEATURES_CONTRATADAS_A_PARTE.includes(feature);
}

// Cada plano lista só as features restritas que ele desbloqueia. Qualquer
// feature que não apareça em nenhum union abaixo é considerada disponível
// para todos os planos por padrão (dashboard, cardápio, financeiro etc. não
// precisam ser listados aqui).
const PLAN_FEATURES: Record<PlanType, Feature[]> = {
  premium: ["tables", "waiters", "commissions", "chat"],
  cents: [],
  legacy_full_access: ["tables", "waiters", "commissions", "chat"],
};

/**
 * Um `plan_type` desconhecido cai em acesso completo, e não em bloqueio.
 *
 * A escolha é deliberada: as empresas atuais têm valores variados nesse campo,
 * e derrubar o acesso de quem já paga por um valor inesperado é um estrago
 * muito maior do que liberar demais até a migração administrativa acontecer.
 * Só `cents` restringe, porque é o único plano vendido com restrição.
 */
const DEFAULT_PLAN: PlanType = "legacy_full_access";

export function normalizePlanType(value: string | null | undefined): PlanType {
  if (value === "cents") return "cents";
  if (value === "premium") return "premium";
  return DEFAULT_PLAN;
}

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  const normalized = normalizePlanType(plan);
  return PLAN_FEATURES[normalized].includes(feature);
}

export function featuresForPlan(plan: string | null | undefined): Feature[] {
  return PLAN_FEATURES[normalizePlanType(plan)];
}

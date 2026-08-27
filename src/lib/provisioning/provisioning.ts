/**
 * Regras do provisionamento automático no SiteCreatorFly.
 *
 * Separadas do acesso ao banco e da rede de propósito: são elas que decidem
 * se um estabelecimento precisa ser provisionado, e precisam ser testáveis
 * sem Postgres e sem o outro sistema no ar.
 *
 * Os estados são os que já existiam na coluna `pizzerias.provision_status`,
 * com CHECK no banco. Não invente valores novos sem migration.
 */

export const PROVISION_PENDING = "provision_pending" as const;
export const PROVISION_DONE = "provisioned" as const;
export const PROVISION_FAILED = "failed" as const;

export type ProvisionStatus =
  typeof PROVISION_PENDING | typeof PROVISION_DONE | typeof PROVISION_FAILED;

/** O que a decisão precisa saber sobre o estabelecimento. */
export type ProvisionSubject = {
  sf_restaurant_id: string | null;
  public_url: string | null;
  /**
   * O endereço para onde o FlyControl empurra cardápio e configurações.
   *
   * Sem ele a loja fica "meio conectada": o cardápio aparece no ar, mas nada
   * que o dono mudar no painel chega lá. É o telefone da cozinha anotado
   * errado — o salão funciona, só que o pedido nunca chega no fogão.
   */
  sync_endpoint?: string | null;
  provision_status: string | null;
};

export type ProvisionDecision =
  /** Já tem tenant, URL e endereço de sincronização: nada a fazer. */
  | { action: "skip"; reason: "already_provisioned" }
  /** Falta alguma peça — provisiona. O SiteCreatorFly devolve o mesmo tenant. */
  | {
      action: "provision";
      reason: "missing_link" | "missing_url" | "missing_sync_endpoint" | "retry_after_failure";
    };

/**
 * Decide se vale chamar o SiteCreatorFly.
 *
 * O curto-circuito é a primeira camada de idempotência: com vínculo e URL
 * gravados, nem sai requisição. A segunda camada é o índice único do outro
 * lado, que garante um tenant por estabelecimento mesmo em chamadas
 * simultâneas — por isso repetir a chamada nunca duplica, só desperdiça.
 */
export function decideProvisioning(subject: ProvisionSubject): ProvisionDecision {
  const hasLink = Boolean(subject.sf_restaurant_id?.trim());
  const hasUrl = Boolean(subject.public_url?.trim());
  const hasSync = Boolean(subject.sync_endpoint?.trim());

  if (hasLink && hasUrl && hasSync) return { action: "skip", reason: "already_provisioned" };

  // Vínculo e URL, mas sem endereço de sincronização: a loja parece pronta —
  // o cardápio abre — e mesmo assim NADA que o dono mudar no painel chega
  // até ela. Antes desta linha, esse estado era considerado "provisionado" e
  // nunca mais se consertava sozinho: a decisão só olhava vínculo e URL.
  if (hasLink && hasUrl) return { action: "provision", reason: "missing_sync_endpoint" };

  // Vínculo sem URL acontece quando o provisionamento antigo gravou pela
  // metade. Chamar de novo é barato e o outro lado devolve o mesmo tenant.
  if (hasLink) return { action: "provision", reason: "missing_url" };

  if (subject.provision_status === PROVISION_FAILED) {
    return { action: "provision", reason: "retry_after_failure" };
  }

  return { action: "provision", reason: "missing_link" };
}

/**
 * Estabelecimento pronto para ter cardápio.
 *
 * O gatilho é a assinatura ficar ativa: antes disso o cliente ainda não pagou,
 * e provisionar seria entregar o produto de graça. Estados intermediários
 * (`pending_activation`, `pending_payment`) não disparam nada.
 */
export function isReadyForProvisioning(subscriptionStatus: string | null | undefined): boolean {
  return subscriptionStatus === "active";
}

/** Nome do estabelecimento para log, sem depender de campo opcional. */
export function describeSubject(id: string, name: string | null | undefined): string {
  return `${id}${name ? ` (${name})` : ""}`;
}

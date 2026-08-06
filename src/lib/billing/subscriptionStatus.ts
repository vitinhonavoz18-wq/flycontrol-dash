/**
 * Máquina de estados da assinatura.
 *
 * Transição arbitrária é como um sistema de cobrança começa a errar: uma
 * assinatura cancelada que volta a "ativa" sem passar por pagamento, um ciclo
 * que reabre depois de faturado. Aqui as transições válidas são explícitas, e
 * o que não está listado é proibido.
 *
 * Puro de propósito: a mesma tabela vale para a interface (habilitar botão) e
 * para o servidor (recusar a operação). O servidor é quem decide.
 */

export const SUBSCRIPTION_STATUSES = [
  "pending_activation",
  "pending_payment",
  "active",
  "past_due",
  "suspended",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending_activation: "Aguardando ativação",
  pending_payment: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  suspended: "Suspensa",
  canceled: "Cancelada",
  expired: "Expirada",
};

/**
 * Transições permitidas.
 *
 * `canceled` e `expired` são terminais: uma assinatura encerrada não
 * ressuscita. Voltar a operar exige assinatura nova, para o histórico de
 * cobrança do período encerrado permanecer intacto.
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  pending_activation: ["pending_payment", "active", "canceled"],
  // Ativação direta existe porque, sem gateway, quem confirma o pagamento é
  // um administrador — e ele confirma o que já recebeu.
  pending_payment: ["active", "canceled", "expired"],
  active: ["past_due", "suspended", "canceled"],
  past_due: ["active", "suspended", "canceled"],
  suspended: ["active", "canceled"],
  canceled: [],
  expired: [],
};

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): TransitionCheck {
  if (!isSubscriptionStatus(from)) {
    return { allowed: false, reason: `Status de origem desconhecido: "${from}".` };
  }
  if (!isSubscriptionStatus(to)) {
    return { allowed: false, reason: `Status de destino desconhecido: "${to}".` };
  }
  if (from === to) {
    return {
      allowed: false,
      reason: `A assinatura já está em "${SUBSCRIPTION_STATUS_LABELS[to]}".`,
    };
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      reason: `Não é possível ir de "${SUBSCRIPTION_STATUS_LABELS[from]}" para "${SUBSCRIPTION_STATUS_LABELS[to]}".`,
    };
  }
  return { allowed: true };
}

export function allowedTransitionsFrom(status: string): readonly SubscriptionStatus[] {
  return isSubscriptionStatus(status) ? ALLOWED_TRANSITIONS[status] : [];
}

/** Estados terminais não aceitam nenhuma transição. */
export function isTerminalStatus(status: string): boolean {
  return isSubscriptionStatus(status) && ALLOWED_TRANSITIONS[status].length === 0;
}

/**
 * A assinatura permite operar? Determina se o consumo é registrado e se o
 * acesso às funcionalidades continua liberado.
 *
 * `past_due` opera de propósito: cortar o acesso no primeiro dia de atraso
 * derruba a operação de um restaurante por um boleto que pode estar só
 * compensando. A suspensão é decisão explícita, não automática.
 */
export function isOperational(status: string): boolean {
  return status === "active" || status === "past_due";
}

/** Ações administrativas disponíveis, derivadas da máquina de estados. */
export type AdminAction = {
  key: "activate" | "suspend" | "reactivate" | "cancel";
  label: string;
  targetStatus: SubscriptionStatus;
  /** Ações que perdem dados ou cortam acesso pedem confirmação reforçada. */
  destructive: boolean;
};

const ACTION_CATALOG: readonly AdminAction[] = [
  { key: "activate", label: "Ativar assinatura", targetStatus: "active", destructive: false },
  { key: "reactivate", label: "Reativar", targetStatus: "active", destructive: false },
  { key: "suspend", label: "Suspender", targetStatus: "suspended", destructive: true },
  { key: "cancel", label: "Cancelar", targetStatus: "canceled", destructive: true },
];

/**
 * Ações oferecidas para um status. "Ativar" e "Reativar" levam ao mesmo
 * destino, mas o rótulo muda conforme a origem — reativar uma assinatura
 * suspensa não é a mesma conversa que ativar uma que nunca operou.
 */
export function availableActions(status: string): AdminAction[] {
  const allowed = allowedTransitionsFrom(status);
  return ACTION_CATALOG.filter((action) => {
    if (!allowed.includes(action.targetStatus)) return false;
    if (action.key === "activate")
      return status === "pending_activation" || status === "pending_payment";
    if (action.key === "reactivate") return status === "suspended" || status === "past_due";
    return true;
  });
}

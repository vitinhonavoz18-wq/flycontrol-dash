/**
 * Configuração central do Kanban de pedidos.
 *
 * Este é o único lugar que sabe quais colunas existem, como elas se chamam,
 * quais transições são permitidas e a partir de quando um pedido é considerado
 * atrasado. Nenhum componente deve repetir esses valores.
 *
 * Os identificadores das colunas são os valores REAIS gravados em
 * `orders.status` — o banco usa `preparando` e `saiu`, não `em_preparo` e
 * `saiu_para_entrega`. Renomear quebraria getFlyStatusKind, o financeiro e a
 * busca de pedidos, então o Kanban se adapta ao banco, e não o contrário.
 */

/** Status que têm coluna no Kanban. */
export const KANBAN_STATUSES = ["novo", "preparando", "saiu"] as const;
export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

/** Status que existem em `orders.status` mas não têm coluna. */
export const TERMINAL_STATUSES = ["entregue", "cancelado"] as const;

export type OrderColumnConfig = {
  id: KanbanStatus;
  label: string;
  /** Descrição lida por leitores de tela ao anunciar a coluna. */
  description: string;
  /** Classe da faixa de destaque no topo da coluna. */
  accentBar: string;
  /** Classe do contador no cabeçalho. */
  accentBadge: string;
  /** Classe da borda quando a coluna é alvo de um card arrastado. */
  accentDropRing: string;
  /** Texto do estado vazio. */
  emptyLabel: string;
};

export const ORDER_COLUMNS: readonly OrderColumnConfig[] = [
  {
    id: "novo",
    label: "Novo pedido",
    description: "Pedidos que acabaram de entrar e ainda não foram aceitos",
    accentBar: "bg-blue-500",
    accentBadge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    accentDropRing: "ring-blue-500/60 bg-blue-500/5",
    emptyLabel: "Nenhum novo pedido no momento.",
  },
  {
    id: "preparando",
    label: "Em preparo",
    description: "Pedidos aceitos que estão sendo preparados na cozinha",
    accentBar: "bg-amber-500",
    accentBadge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    accentDropRing: "ring-amber-500/60 bg-amber-500/5",
    emptyLabel: "Nenhum pedido em preparo.",
  },
  {
    id: "saiu",
    label: "Saiu para entrega",
    description: "Pedidos que já saíram com o entregador",
    accentBar: "bg-emerald-500",
    accentBadge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    accentDropRing: "ring-emerald-500/60 bg-emerald-500/5",
    emptyLabel: "Nenhum pedido saiu para entrega.",
  },
] as const;

export function isKanbanStatus(status: string | null | undefined): status is KanbanStatus {
  return !!status && (KANBAN_STATUSES as readonly string[]).includes(status);
}

export function getColumnConfig(status: KanbanStatus): OrderColumnConfig {
  // O tipo garante a existência; o `!` evita um ramo morto que nunca executa.
  return ORDER_COLUMNS.find((c) => c.id === status)!;
}

/** Rótulo legível de qualquer status, inclusive os que não têm coluna. */
export function getStatusLabel(status: string): string {
  if (isKanbanStatus(status)) return getColumnConfig(status).label;
  if (status === "entregue") return "Entregue";
  if (status === "cancelado") return "Cancelado";
  return status;
}

// ---------------------------------------------------------------------------
// Atraso
// ---------------------------------------------------------------------------

export type DelayLevel = "normal" | "attention" | "late";

/**
 * Limites de atraso, em minutos, contados desde a criação do pedido.
 * Alterar aqui muda o comportamento em toda a tela.
 */
export const DELAY_THRESHOLD_MINUTES = {
  attention: 10,
  late: 20,
} as const;

/** De quanto em quanto tempo o contador dos cards é recalculado. */
export const ELAPSED_TICK_MS = 30_000;

export function getElapsedMinutes(createdAt: string | Date, now: number): number {
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now - created) / 60_000);
}

export function getDelayLevel(createdAt: string | Date, now: number): DelayLevel {
  const minutes = getElapsedMinutes(createdAt, now);
  if (minutes >= DELAY_THRESHOLD_MINUTES.late) return "late";
  if (minutes >= DELAY_THRESHOLD_MINUTES.attention) return "attention";
  return "normal";
}

/** "Agora", "Há 3 minutos", "Há 1 hora", "Há 2 horas e 5 minutos". */
export function formatElapsed(createdAt: string | Date, now: number): string {
  const totalMinutes = Math.floor(getElapsedMinutes(createdAt, now));
  if (totalMinutes < 1) return "Agora";
  if (totalMinutes === 1) return "Há 1 minuto";
  if (totalMinutes < 60) return `Há ${totalMinutes} minutos`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursLabel = hours === 1 ? "1 hora" : `${hours} horas`;
  if (minutes === 0) return `Há ${hoursLabel}`;
  const minutesLabel = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  return `Há ${hoursLabel} e ${minutesLabel}`;
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

export type MoveCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Regra de movimentação. O fluxo natural é
 * `novo → preparando → saiu`, mas voltar uma etapa é permitido — um pedido
 * devolvido pela cozinha precisa voltar para "Em preparo".
 *
 * Só é bloqueado o que não faz sentido: soltar o card na coluna em que ele
 * já está, ou mover um pedido já finalizado/cancelado.
 */
export function canMoveOrder(from: string, to: KanbanStatus): MoveCheck {
  if (from === to) {
    return { allowed: false, reason: "O pedido já está nesta etapa." };
  }
  if (!isKanbanStatus(from)) {
    return {
      allowed: false,
      reason: `Pedidos com status "${getStatusLabel(from)}" não podem ser movidos pelo quadro.`,
    };
  }
  return { allowed: true };
}

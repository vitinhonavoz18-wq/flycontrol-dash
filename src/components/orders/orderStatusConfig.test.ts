import { describe, expect, it } from "vitest";
import {
  DELAY_THRESHOLD_MINUTES,
  KANBAN_STATUSES,
  ORDER_COLUMNS,
  canMoveOrder,
  formatElapsed,
  getColumnConfig,
  getDelayLevel,
  getElapsedMinutes,
  getStatusLabel,
  isKanbanStatus,
} from "./orderStatusConfig";

const NOW = new Date("2026-08-05T12:00:00Z").getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("configuração das colunas", () => {
  it("expõe exatamente as três etapas do quadro, na ordem do fluxo", () => {
    expect(ORDER_COLUMNS.map((c) => c.id)).toEqual(["novo", "preparando", "saiu"]);
  });

  it("usa os status reais do banco, não os nomes sugeridos no briefing", () => {
    // Guarda-corpo: se alguém renomear para em_preparo/saiu_para_entrega sem
    // migrar os dados, o Kanban para de encontrar os pedidos existentes.
    expect(KANBAN_STATUSES).toContain("preparando");
    expect(KANBAN_STATUSES).toContain("saiu");
    expect(KANBAN_STATUSES).not.toContain("em_preparo");
    expect(KANBAN_STATUSES).not.toContain("saiu_para_entrega");
  });

  it("dá a cada coluna rótulo, estado vazio e cor de destaque próprios", () => {
    for (const column of ORDER_COLUMNS) {
      expect(column.label).toBeTruthy();
      expect(column.emptyLabel).toBeTruthy();
      expect(column.accentBar).toBeTruthy();
      expect(getColumnConfig(column.id)).toBe(column);
    }
  });

  it("reconhece apenas os status que têm coluna", () => {
    expect(isKanbanStatus("novo")).toBe(true);
    expect(isKanbanStatus("preparando")).toBe(true);
    expect(isKanbanStatus("saiu")).toBe(true);
    expect(isKanbanStatus("entregue")).toBe(false);
    expect(isKanbanStatus("pronto")).toBe(false);
    expect(isKanbanStatus(null)).toBe(false);
    expect(isKanbanStatus(undefined)).toBe(false);
  });

  it("rotula também os status sem coluna", () => {
    expect(getStatusLabel("novo")).toBe("Novo pedido");
    expect(getStatusLabel("entregue")).toBe("Entregue");
    expect(getStatusLabel("cancelado")).toBe("Cancelado");
    // Status desconhecido não vira "undefined" na tela.
    expect(getStatusLabel("pronto")).toBe("pronto");
  });
});

describe("regras de movimentação", () => {
  it("permite avançar no fluxo", () => {
    expect(canMoveOrder("novo", "preparando")).toEqual({ allowed: true });
    expect(canMoveOrder("preparando", "saiu")).toEqual({ allowed: true });
  });

  it("permite voltar uma etapa", () => {
    expect(canMoveOrder("preparando", "novo")).toEqual({ allowed: true });
    expect(canMoveOrder("saiu", "preparando")).toEqual({ allowed: true });
  });

  it("permite pular etapa", () => {
    expect(canMoveOrder("novo", "saiu")).toEqual({ allowed: true });
  });

  it("permite finalizar direto de qualquer coluna do quadro", () => {
    expect(canMoveOrder("novo", "entregue")).toEqual({ allowed: true });
    expect(canMoveOrder("preparando", "entregue")).toEqual({ allowed: true });
    expect(canMoveOrder("saiu", "entregue")).toEqual({ allowed: true });
  });

  it("recusa soltar o card na coluna em que ele já está", () => {
    const result = canMoveOrder("preparando", "preparando");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/já está/i);
  });

  it("recusa mover pedidos finalizados e explica o motivo", () => {
    for (const status of ["entregue", "cancelado"]) {
      const result = canMoveOrder(status, "preparando");
      expect(result.allowed).toBe(false);
      expect(result.allowed === false && result.reason).toContain(getStatusLabel(status));
    }
  });
});

describe("tempo decorrido e atraso", () => {
  it("classifica pelos limites centralizados", () => {
    expect(getDelayLevel(minutesAgo(0), NOW)).toBe("normal");
    expect(getDelayLevel(minutesAgo(DELAY_THRESHOLD_MINUTES.attention - 1), NOW)).toBe("normal");
    expect(getDelayLevel(minutesAgo(DELAY_THRESHOLD_MINUTES.attention), NOW)).toBe("attention");
    expect(getDelayLevel(minutesAgo(DELAY_THRESHOLD_MINUTES.late - 1), NOW)).toBe("attention");
    expect(getDelayLevel(minutesAgo(DELAY_THRESHOLD_MINUTES.late), NOW)).toBe("late");
    expect(getDelayLevel(minutesAgo(180), NOW)).toBe("late");
  });

  it("nunca devolve tempo negativo para data no futuro", () => {
    const future = new Date(NOW + 5 * 60_000).toISOString();
    expect(getElapsedMinutes(future, NOW)).toBe(0);
    expect(getDelayLevel(future, NOW)).toBe("normal");
  });

  it("trata data inválida sem quebrar", () => {
    expect(getElapsedMinutes("não é uma data", NOW)).toBe(0);
    expect(formatElapsed("não é uma data", NOW)).toBe("Agora");
  });

  it("formata em português com singular e plural corretos", () => {
    expect(formatElapsed(minutesAgo(0), NOW)).toBe("Agora");
    expect(formatElapsed(minutesAgo(1), NOW)).toBe("Há 1 minuto");
    expect(formatElapsed(minutesAgo(3), NOW)).toBe("Há 3 minutos");
    expect(formatElapsed(minutesAgo(18), NOW)).toBe("Há 18 minutos");
    expect(formatElapsed(minutesAgo(60), NOW)).toBe("Há 1 hora");
    expect(formatElapsed(minutesAgo(61), NOW)).toBe("Há 1 hora e 1 minuto");
    expect(formatElapsed(minutesAgo(125), NOW)).toBe("Há 2 horas e 5 minutos");
    expect(formatElapsed(minutesAgo(120), NOW)).toBe("Há 2 horas");
  });
});

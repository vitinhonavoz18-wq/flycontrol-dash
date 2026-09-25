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
  getStatusLabelForOrder,
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

  it("finaliza a partir de 'Em preparo' e de 'Saiu para entrega'", () => {
    // "Em preparo" entra porque balcão e mesa não têm entregador: exigir a
    // passagem por "Saiu para entrega" obrigaria o lojista a mentir no
    // quadro para fechar uma retirada no balcão.
    expect(canMoveOrder("preparando", "entregue")).toEqual({ allowed: true });
    expect(canMoveOrder("saiu", "entregue")).toEqual({ allowed: true });
  });

  it("NÃO finaliza um pedido recém-chegado", () => {
    // Regra nova, e de propósito: até aqui o quadro aceitava
    // "novo → entregue". Um pedido que acabou de entrar não foi aceito,
    // ninguém preparou e ninguém entregou — finalizar dali é sempre engano,
    // e engano caro, porque o pedido some do quadro como se tivesse sido
    // cumprido. É a comanda que chega na cozinha e alguém carimba
    // "entregue" sem ninguém ter cozinhado nada.
    const r = canMoveOrder("novo", "entregue");
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.reason).toMatch(/Aceite o pedido antes de finalizar/);
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

describe("rótulo do status para o pedido", () => {
  it("na retirada, 'saiu' quer dizer pronto para retirada", () => {
    expect(getStatusLabelForOrder("saiu", "pickup")).toBe("Pronto para retirada");
  });
  it("na entrega e nas outras etapas, o rótulo de sempre", () => {
    expect(getStatusLabelForOrder("saiu", "delivery")).toBe("Saiu para entrega");
    expect(getStatusLabelForOrder("preparando", "pickup")).toBe("Em preparo");
    expect(getStatusLabelForOrder("entregue", "pickup")).toBe("Entregue");
  });
});

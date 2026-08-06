import { describe, expect, it } from "vitest";
import { calculateCycleProgress, daysUntil, getPromotionState } from "./cycleProgress";
import { formatCents } from "./money";

const NOW = new Date("2026-08-06T12:00:00Z");
const CYCLE_END = new Date("2026-09-05T12:00:00Z");

function progress(overrides: Partial<Parameters<typeof calculateCycleProgress>[0]> = {}) {
  return calculateCycleProgress(
    {
      planCode: "cents",
      unitPriceCents: 70,
      promotionThresholdOrders: 500,
      billableOrderCount: 0,
      qualifiedFromPreviousCycle: false,
      setupFeeAlreadyCharged: true,
      cycleEnd: CYCLE_END,
      now: NOW,
      ...overrides,
    },
    formatCents,
  );
}

describe("estado da promoção", () => {
  it("abaixo da meta, pagando o preço cheio", () => {
    expect(
      getPromotionState({
        billableOrderCount: 347,
        promotionThresholdOrders: 500,
        qualifiedFromPreviousCycle: false,
      }),
    ).toBe("below_target");
  });

  it("meta atingida pela primeira vez", () => {
    expect(
      getPromotionState({
        billableOrderCount: 500,
        promotionThresholdOrders: 500,
        qualifiedFromPreviousCycle: false,
      }),
    ).toBe("target_reached");
  });

  it("já no promocional e batendo a meta de novo", () => {
    expect(
      getPromotionState({
        billableOrderCount: 520,
        promotionThresholdOrders: 500,
        qualifiedFromPreviousCycle: true,
      }),
    ).toBe("keeping_promotion");
  });

  it("já no promocional mas abaixo da meta — vai perder", () => {
    expect(
      getPromotionState({
        billableOrderCount: 420,
        promotionThresholdOrders: 500,
        qualifiedFromPreviousCycle: true,
      }),
    ).toBe("losing_promotion");
  });
});

describe("mensagens", () => {
  it("diz quantos pedidos faltam para ganhar o desconto", () => {
    const result = progress({ billableOrderCount: 347 });
    expect(result.ordersRemaining).toBe(153);
    expect(result.message).toContain("Faltam 153 pedidos");
    expect(result.message).toContain("R$ 0,45");
  });

  it("usa o singular quando falta um pedido só", () => {
    expect(progress({ billableOrderCount: 499 }).message).toContain("Faltam 1 pedido para");
  });

  it("comemora a meta batida", () => {
    const result = progress({ billableOrderCount: 500 });
    expect(result.message).toContain("Meta atingida!");
    expect(result.message).toContain("próximo ciclo");
  });

  it("confirma a manutenção do desconto", () => {
    const result = progress({
      billableOrderCount: 520,
      unitPriceCents: 45,
      qualifiedFromPreviousCycle: true,
    });
    expect(result.message).toContain("continuará pagando R$ 0,45");
  });

  it("avisa que o preço vai subir antes de subir", () => {
    // O cliente precisa saber que vai perder o desconto, e não descobrir na
    // fatura seguinte.
    const result = progress({
      billableOrderCount: 420,
      unitPriceCents: 45,
      qualifiedFromPreviousCycle: true,
    });
    expect(result.message).toContain("R$ 0,45 por pedido neste ciclo");
    expect(result.message).toContain("volta para R$ 0,70");
  });
});

describe("progresso e estimativa", () => {
  it("calcula a porcentagem da meta", () => {
    expect(progress({ billableOrderCount: 347 }).percent).toBeCloseTo(69.4, 1);
  });

  it("não passa de 100% quando o cliente supera a meta", () => {
    // Uma barra de 120% não significa nada visualmente.
    expect(progress({ billableOrderCount: 600 }).percent).toBe(100);
    expect(progress({ billableOrderCount: 600 }).ordersRemaining).toBe(0);
  });

  it("estima o total do ciclo pelo preço vigente", () => {
    // Exemplo do briefing: 347 pedidos a R$ 0,70 = R$ 242,90.
    const result = progress({ billableOrderCount: 347 });
    expect(result.estimatedTotalCents).toBe(24290);
    expect(formatCents(result.estimatedTotalCents)).toBe("R$ 242,90");
  });

  it("inclui a taxa de cadastro só no primeiro ciclo", () => {
    const primeiro = progress({ billableOrderCount: 100, setupFeeAlreadyCharged: false });
    expect(primeiro.setupFeeCents).toBe(2500);
    expect(primeiro.estimatedTotalCents).toBe(9500); // R$ 25,00 + R$ 70,00

    // Depois de faturada, some da estimativa — mantê-la inflaria todo mês.
    const segundo = progress({ billableOrderCount: 100, setupFeeAlreadyCharged: true });
    expect(segundo.setupFeeCents).toBe(0);
    expect(segundo.estimatedTotalCents).toBe(7000);
  });

  it("anuncia o preço do próximo ciclo conforme a qualificação", () => {
    expect(progress({ billableOrderCount: 499 }).nextCycleUnitPriceCents).toBe(70);
    expect(progress({ billableOrderCount: 500 }).nextCycleUnitPriceCents).toBe(45);
    expect(
      progress({ billableOrderCount: 420, unitPriceCents: 45, qualifiedFromPreviousCycle: true })
        .nextCycleUnitPriceCents,
    ).toBe(70);
  });

  it("no PREMIUM não há meta nem consumo", () => {
    const result = progress({
      planCode: "premium",
      unitPriceCents: 0,
      promotionThresholdOrders: 0,
      billableOrderCount: 300,
    });
    expect(result.percent).toBe(0);
    // Só a mensalidade entra na estimativa.
    expect(result.estimatedTotalCents).toBe(37500);
    expect(result.nextCycleUnitPriceCents).toBe(0);
  });
});

describe("dias restantes", () => {
  it("conta os dias até o fim do ciclo", () => {
    expect(daysUntil(CYCLE_END, NOW)).toBe(30);
  });

  it("não devolve valor negativo em ciclo vencido", () => {
    expect(daysUntil(new Date("2026-08-01T00:00:00Z"), NOW)).toBe(0);
  });

  it("trata data inválida sem quebrar", () => {
    expect(daysUntil(new Date("inválida"), NOW)).toBe(0);
  });
});

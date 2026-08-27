import { describe, expect, it } from "vitest";
import {
  buildInvoiceItems,
  calculateCycle,
  computeCycleEnd,
  computeNextCycleStart,
  determineNextCycleUnitPrice,
  initialUnitPriceCents,
  isBillableOrder,
  qualifiesForPromotion,
  usageIdempotencyKey,
} from "./billingEngine";
import { formatCents, multiplyCents, sumCents } from "./money";
import { PLAN_PRICING } from "./plans";

const CENTS_DEFAULT = 70;
const CENTS_PROMO = 45;
const THRESHOLD = 500;

/** Atalho para um ciclo CENTS, com a taxa de cadastro já cobrada por padrão. */
function centsCycle(overrides: Partial<Parameters<typeof calculateCycle>[0]> = {}) {
  return calculateCycle({
    planCode: "cents",
    unitPriceCents: CENTS_DEFAULT,
    promotionThresholdOrders: THRESHOLD,
    billableOrderCount: 0,
    setupFeeAlreadyCharged: true,
    ...overrides,
  });
}

describe("preços comerciais", () => {
  it("guarda todos os valores em centavos inteiros", () => {
    expect(PLAN_PRICING.premium.monthlyFeeCents).toBe(37500);
    expect(PLAN_PRICING.cents.setupFeeCents).toBe(0);
    expect(PLAN_PRICING.cents.defaultOrderUnitPriceCents).toBe(70);
    expect(PLAN_PRICING.cents.promotionalOrderUnitPriceCents).toBe(45);
    expect(PLAN_PRICING.cents.promotionThresholdOrders).toBe(500);

    for (const plan of Object.values(PLAN_PRICING)) {
      for (const value of [
        plan.setupFeeCents,
        plan.monthlyFeeCents,
        plan.defaultOrderUnitPriceCents,
        plan.promotionalOrderUnitPriceCents,
      ]) {
        expect(Number.isSafeInteger(value)).toBe(true);
      }
    }
  });

  it("não cobra taxa de cadastro nem por pedido no PREMIUM", () => {
    expect(PLAN_PRICING.premium.setupFeeCents).toBe(0);
    expect(PLAN_PRICING.premium.defaultOrderUnitPriceCents).toBe(0);
  });

  it("não cobra mensalidade fixa no CENTS", () => {
    expect(PLAN_PRICING.cents.monthlyFeeCents).toBe(0);
  });
});

describe("aritmética em centavos", () => {
  it("evita o erro de ponto flutuante que apareceria em reais", () => {
    // Caso real do briefing: 499 pedidos a R$ 0,70. Em ponto flutuante o
    // resultado é 349.29999999999995 — a fatura sairia com um centavo a menos.
    expect(499 * 0.7).not.toBe(349.3);
    expect(multiplyCents(70, 499)).toBe(34930);

    // O clássico, pelo mesmo motivo.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumCents(10, 20)).toBe(30);
  });

  it("recusa quantidade fracionária em vez de arredondar em silêncio", () => {
    expect(() => multiplyCents(70, 1.5)).toThrow(/inteiro/);
    expect(() => multiplyCents(70, -1)).toThrow(/não negativo/);
  });

  it("recusa preço fracionário", () => {
    expect(() => sumCents(70, 0.5)).toThrow(/centavos/);
  });

  it("formata em real brasileiro só na apresentação", () => {
    expect(formatCents(37500)).toBe("R$ 375,00");
    expect(formatCents(2500)).toBe("R$ 25,00");
    expect(formatCents(70)).toBe("R$ 0,70");
    expect(formatCents(23400)).toBe("R$ 234,00");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(123456789)).toBe("R$ 1.234.567,89");
  });
});

describe("pedido faturável", () => {
  const base = { total: 50, items: [{ name: "Pizza" }], customer_name: "João" };

  it("conta a partir do momento em que entra no fluxo operacional", () => {
    for (const status of ["preparando", "saiu", "entregue", "pronto"]) {
      expect(isBillableOrder({ ...base, status })).toBe(true);
    }
  });

  it("não conta pedido apenas recebido — ele ainda pode ser recusado", () => {
    expect(isBillableOrder({ ...base, status: "novo" })).toBe(false);
    expect(isBillableOrder({ ...base, status: "pendente" })).toBe(false);
  });

  it("não conta cancelado nem excluído", () => {
    for (const status of ["cancelado", "cancelled", "deleted", "recusado"]) {
      expect(isBillableOrder({ ...base, status })).toBe(false);
    }
  });

  it("não conta pedido de teste", () => {
    expect(isBillableOrder({ ...base, status: "entregue", is_test: true })).toBe(false);
  });

  it("respeita a exclusão explícita, mesmo em pedido válido", () => {
    expect(isBillableOrder({ ...base, status: "entregue", is_billable_override: false })).toBe(
      false,
    );
  });

  it("não conta o pedido-fantasma criado ao abrir uma mesa", () => {
    expect(
      isBillableOrder({ status: "preparando", total: 0, items: [], customer_name: "Cliente Site" }),
    ).toBe(false);
  });

  it("aceita status vindos de integrações em inglês", () => {
    expect(isBillableOrder({ ...base, status: "delivered" })).toBe(true);
    expect(isBillableOrder({ ...base, status: "COMPLETED" })).toBe(true);
  });

  it("não conta status vazio ou desconhecido", () => {
    expect(isBillableOrder({ ...base, status: null })).toBe(false);
    expect(isBillableOrder({ ...base, status: "status_que_nao_existe" })).toBe(false);
  });
});

describe("PREMIUM", () => {
  it("cobra apenas a mensalidade de R$ 375,00", () => {
    const totals = calculateCycle({
      planCode: "premium",
      unitPriceCents: 0,
      promotionThresholdOrders: 0,
      billableOrderCount: 0,
      setupFeeAlreadyCharged: false,
    });
    expect(totals.totalAmountCents).toBe(37500);
    expect(totals.setupFeeAmountCents).toBe(0);
  });

  it("não aumenta a fatura com o volume de pedidos", () => {
    for (const count of [0, 100, 500, 10_000]) {
      const totals = calculateCycle({
        planCode: "premium",
        unitPriceCents: 0,
        promotionThresholdOrders: 0,
        billableOrderCount: count,
        setupFeeAlreadyCharged: true,
      });
      expect(totals.totalAmountCents).toBe(37500);
      expect(totals.usageAmountCents).toBe(0);
      // Os pedidos continuam registrados como métrica.
      expect(totals.billableOrderCount).toBe(count);
    }
  });

  it("nunca qualifica para a promoção do CENTS", () => {
    const totals = calculateCycle({
      planCode: "premium",
      unitPriceCents: 0,
      promotionThresholdOrders: 500,
      billableOrderCount: 5000,
      setupFeeAlreadyCharged: true,
    });
    expect(totals.qualifiedForNextCycle).toBe(false);
    expect(determineNextCycleUnitPrice({ planCode: "premium", qualifiedForNextCycle: false })).toBe(
      0,
    );
  });

  it("emite uma fatura só com a mensalidade", () => {
    const totals = calculateCycle({
      planCode: "premium",
      unitPriceCents: 0,
      promotionThresholdOrders: 0,
      billableOrderCount: 300,
      setupFeeAlreadyCharged: true,
    });
    const items = buildInvoiceItems("premium", totals);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemType: "monthly_fee", totalAmountCents: 37500 });
  });
});

describe("CENTS — primeiro ciclo", () => {
  it("cobra só o consumo: não existe mais taxa de cadastro", () => {
    // Antes a primeira conta somava R$ 25,00. Hoje, 100 pedidos x R$ 0,70
    // fecham em R$ 70,00 e nada mais.
    const totals = centsCycle({ billableOrderCount: 100, setupFeeAlreadyCharged: false });
    expect(totals.setupFeeAmountCents).toBe(0);
    expect(totals.usageAmountCents).toBe(7000);
    expect(totals.totalAmountCents).toBe(7000);
    expect(formatCents(totals.totalAmountCents)).toBe("R$ 70,00");
  });

  it("começa em R$ 0,70 por pedido", () => {
    expect(initialUnitPriceCents("cents")).toBe(CENTS_DEFAULT);
  });

  it("cobra o mesmo no primeiro ciclo e nos seguintes", () => {
    const primeiro = centsCycle({ billableOrderCount: 100, setupFeeAlreadyCharged: false });
    const segundo = centsCycle({ billableOrderCount: 100, setupFeeAlreadyCharged: true });
    expect(segundo.setupFeeAmountCents).toBe(0);
    expect(segundo.totalAmountCents).toBe(primeiro.totalAmountCents);
  });

  it("emite só o item de consumo, sem linha de taxa de cadastro", () => {
    const totals = centsCycle({ billableOrderCount: 100, setupFeeAlreadyCharged: false });
    const items = buildInvoiceItems("cents", totals);
    expect(items.map((i) => i.itemType)).toEqual(["usage"]);
    expect(items.find((i) => i.itemType === "usage")).toMatchObject({
      quantity: 100,
      unitAmountCents: 70,
      totalAmountCents: 7000,
    });
  });

  it("não emite item de consumo em ciclo sem pedidos", () => {
    const totals = centsCycle({ billableOrderCount: 0, setupFeeAlreadyCharged: true });
    expect(buildInvoiceItems("cents", totals)).toHaveLength(0);
    expect(totals.totalAmountCents).toBe(0);
  });
});

describe("CENTS — regra da promoção", () => {
  it("499 pedidos não qualificam", () => {
    const totals = centsCycle({ billableOrderCount: 499 });
    expect(totals.qualifiedForNextCycle).toBe(false);
    expect(totals.totalAmountCents).toBe(34930); // 499 x 70
    expect(determineNextCycleUnitPrice({ planCode: "cents", qualifiedForNextCycle: false })).toBe(
      70,
    );
  });

  it("500 pedidos qualificam, e o ciclo que atingiu a meta NÃO fica mais barato", () => {
    const totals = centsCycle({ billableOrderCount: 500 });
    expect(totals.qualifiedForNextCycle).toBe(true);
    // O ponto central da regra: 500 x R$ 0,70 = R$ 350,00, e não x R$ 0,45.
    expect(totals.unitPriceCents).toBe(CENTS_DEFAULT);
    expect(totals.totalAmountCents).toBe(35000);
    expect(formatCents(totals.totalAmountCents)).toBe("R$ 350,00");
  });

  it("501 pedidos também qualificam", () => {
    expect(centsCycle({ billableOrderCount: 501 }).qualifiedForNextCycle).toBe(true);
  });

  it("aplica R$ 0,45 somente ao ciclo seguinte", () => {
    const ciclo1 = centsCycle({ billableOrderCount: 500 });
    expect(
      determineNextCycleUnitPrice({
        planCode: "cents",
        qualifiedForNextCycle: ciclo1.qualifiedForNextCycle,
      }),
    ).toBe(CENTS_PROMO);
  });

  it("mantém R$ 0,45 enquanto a meta continuar sendo atingida", () => {
    // Ciclo 2 do briefing: preço R$ 0,45, 520 pedidos, total R$ 234,00.
    const ciclo2 = centsCycle({ unitPriceCents: CENTS_PROMO, billableOrderCount: 520 });
    expect(ciclo2.totalAmountCents).toBe(23400);
    expect(formatCents(ciclo2.totalAmountCents)).toBe("R$ 234,00");
    expect(ciclo2.qualifiedForNextCycle).toBe(true);
    expect(determineNextCycleUnitPrice({ planCode: "cents", qualifiedForNextCycle: true })).toBe(
      CENTS_PROMO,
    );
  });

  it("perde a promoção para o PRÓXIMO ciclo, sem encarecer o atual", () => {
    // Ciclo 3 do briefing: preço R$ 0,45, 420 pedidos, total R$ 189,00.
    const ciclo3 = centsCycle({ unitPriceCents: CENTS_PROMO, billableOrderCount: 420 });
    expect(ciclo3.unitPriceCents).toBe(CENTS_PROMO);
    expect(ciclo3.totalAmountCents).toBe(18900);
    expect(formatCents(ciclo3.totalAmountCents)).toBe("R$ 189,00");
    expect(ciclo3.qualifiedForNextCycle).toBe(false);
    // Ciclo 4 volta para R$ 0,70.
    expect(determineNextCycleUnitPrice({ planCode: "cents", qualifiedForNextCycle: false })).toBe(
      CENTS_DEFAULT,
    );
  });

  it("percorre a sequência completa dos quatro ciclos do briefing", () => {
    const cenarios = [
      { orders: 500, price: CENTS_DEFAULT, total: 35000, nextPrice: CENTS_PROMO },
      { orders: 520, price: CENTS_PROMO, total: 23400, nextPrice: CENTS_PROMO },
      { orders: 420, price: CENTS_PROMO, total: 18900, nextPrice: CENTS_DEFAULT },
      { orders: 100, price: CENTS_DEFAULT, total: 7000, nextPrice: CENTS_DEFAULT },
    ];

    for (const cenario of cenarios) {
      const totals = centsCycle({
        unitPriceCents: cenario.price,
        billableOrderCount: cenario.orders,
      });
      expect(totals.totalAmountCents).toBe(cenario.total);
      expect(
        determineNextCycleUnitPrice({
          planCode: "cents",
          qualifiedForNextCycle: totals.qualifiedForNextCycle,
        }),
      ).toBe(cenario.nextPrice);
    }
  });

  it("não qualifica quando a meta está desligada", () => {
    expect(
      qualifiesForPromotion({
        planCode: "cents",
        promotionThresholdOrders: 0,
        billableOrderCount: 9999,
      }),
    ).toBe(false);
  });
});

describe("idempotência", () => {
  it("gera a mesma chave para o mesmo pedido no mesmo ciclo", () => {
    expect(usageIdempotencyKey("cycle-1", "order-1")).toBe(
      usageIdempotencyKey("cycle-1", "order-1"),
    );
  });

  it("distingue o mesmo pedido em ciclos diferentes", () => {
    expect(usageIdempotencyKey("cycle-1", "order-1")).not.toBe(
      usageIdempotencyKey("cycle-2", "order-1"),
    );
  });

  it("recalcular um ciclo com a mesma entrada dá exatamente o mesmo resultado", () => {
    const input = {
      planCode: "cents" as const,
      unitPriceCents: CENTS_DEFAULT,
      promotionThresholdOrders: THRESHOLD,
      billableOrderCount: 347,
      setupFeeAlreadyCharged: true,
    };
    expect(calculateCycle(input)).toEqual(calculateCycle(input));
  });
});

describe("ciclo mensal ancorado na ativação", () => {
  it("encerra um mês após o início", () => {
    // Ativação em 12 de agosto → ciclo até 11 de setembro, próximo em 12.
    const start = new Date(Date.UTC(2026, 7, 12));
    expect(computeCycleEnd(start).toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(computeNextCycleStart(start).toISOString().slice(0, 10)).toBe("2026-09-12");
  });

  it("cobre o mês inteiro quando a âncora é o dia 1º", () => {
    const start = new Date(Date.UTC(2026, 7, 1));
    expect(computeCycleEnd(start).toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("não perde nenhum dia quando a âncora não existe no mês seguinte", () => {
    // 31 de janeiro: fevereiro não tem dia 31. O ciclo vai até o fim de
    // fevereiro e o próximo começa em 1º de março — sem dia órfão.
    const start = new Date(Date.UTC(2026, 0, 31));
    expect(computeCycleEnd(start).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(computeNextCycleStart(start).toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("respeita ano bissexto", () => {
    const start = new Date(Date.UTC(2028, 0, 31));
    expect(computeCycleEnd(start).toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("gera ciclos contíguos: o fim de um é o instante anterior ao início do próximo", () => {
    for (const start of [
      new Date(Date.UTC(2026, 0, 31)),
      new Date(Date.UTC(2026, 7, 12)),
      new Date(Date.UTC(2026, 11, 31)),
    ]) {
      expect(computeCycleEnd(start).getTime() + 1).toBe(computeNextCycleStart(start).getTime());
    }
  });
});

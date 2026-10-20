import { describe, expect, it } from "vitest";
import {
  decideScheduledChange,
  effectiveDateLabel,
  isLegacyPrice,
  scheduledChangeSentence,
  type CurrentPaidSubscription,
} from "./scheduledPlanChange";
import { parseScheduleInput } from "./scheduledPlanChange.functions";

const V2_MENSAL = "pv-premium-v2";
const V1_ANUAL = "pv-anual-v1";

const sub = (o: Partial<CurrentPaidSubscription> = {}): CurrentPaidSubscription => ({
  planCode: "premium",
  status: "active",
  priceVersionId: V2_MENSAL,
  contractedCycleFeeCents: 8990,
  hasOpenCycle: true,
  ...o,
});

// A ADEGA como está em produção: Premium v1 a R$ 375,00, ativa, cobrança
// pausada (sem ciclo aberto).
const adega = sub({
  priceVersionId: "pv-premium-v1",
  contractedCycleFeeCents: 37500,
  hasOpenCycle: false,
});

describe("oferta de preço novo (assinantes de versão antiga)", () => {
  it("só quem paga um preço diferente da tabela vê a oferta", () => {
    expect(isLegacyPrice(adega)).toBe(true);
    expect(isLegacyPrice(sub())).toBe(false);
    expect(isLegacyPrice(sub({ planCode: "premium_anual", contractedCycleFeeCents: 59880 }))).toBe(
      false,
    );
    expect(isLegacyPrice(sub({ planCode: "cents", contractedCycleFeeCents: 0 }))).toBe(false);
  });

  it("ADEGA (cobrança pausada) pode aceitar R$ 89,90 ou o anual, mas o aceite só fica registrado para a equipe", () => {
    expect(decideScheduledChange(adega, "premium", V2_MENSAL)).toEqual({
      ok: true,
      status: "awaiting_team",
      source: "legacy_offer",
    });
    expect(decideScheduledChange(adega, "premium_anual", V1_ANUAL)).toEqual({
      ok: true,
      status: "awaiting_team",
      source: "legacy_offer",
    });
  });

  it("preço antigo COM cobrança rodando: a troca vale na próxima renovação", () => {
    const antigoAtivo = sub({ priceVersionId: "pv-premium-v1", contractedCycleFeeCents: 37500 });
    expect(decideScheduledChange(antigoAtivo, "premium", V2_MENSAL)).toEqual({
      ok: true,
      status: "scheduled",
      source: "legacy_offer",
    });
  });
});

describe("troca mensal ↔ anual de quem já paga", () => {
  it("mensal → anual e anual → mensal ficam agendadas para a renovação", () => {
    expect(decideScheduledChange(sub(), "premium_anual", V1_ANUAL)).toEqual({
      ok: true,
      status: "scheduled",
      source: "customer_switch",
    });
    const anual = sub({
      planCode: "premium_anual",
      priceVersionId: V1_ANUAL,
      contractedCycleFeeCents: 59880,
    });
    expect(decideScheduledChange(anual, "premium", V2_MENSAL)).toMatchObject({
      ok: true,
      status: "scheduled",
    });
  });

  it("escolher o próprio plano no preço atual não agenda nada", () => {
    expect(decideScheduledChange(sub(), "premium", V2_MENSAL)).toMatchObject({
      ok: false,
      code: "same_plan",
    });
  });

  it("fatura atrasada, período grátis, CENTS e sem assinatura não agendam", () => {
    expect(
      decideScheduledChange(sub({ status: "past_due" }), "premium_anual", V1_ANUAL),
    ).toMatchObject({
      ok: false,
      code: "not_active",
    });
    expect(
      decideScheduledChange(sub({ status: "free_trial" }), "premium_anual", V1_ANUAL),
    ).toMatchObject({
      ok: false,
    });
    expect(decideScheduledChange(sub({ planCode: "cents" }), "premium", V2_MENSAL)).toMatchObject({
      ok: false,
      code: "not_premium",
    });
    expect(decideScheduledChange(null, "premium", V2_MENSAL)).toMatchObject({ ok: false });
  });
});

describe("o que a tela diz", () => {
  it("'a partir de dd/mm' é o dia seguinte ao fim do ciclo, no horário de São Paulo", () => {
    // Fim do ciclo 15/11 14:59:59 UTC → renova em 15/11 (horário de Brasília).
    expect(effectiveDateLabel("2026-11-15T14:59:59.999Z")).toBe("15/11/2026");
    expect(
      scheduledChangeSentence({
        target: "premium_anual",
        status: "scheduled",
        cycleEnd: "2026-11-15T14:59:59.999Z",
      }),
    ).toBe("A partir de 15/11/2026 você passa para o Premium Anual por R$ 598,80/ano.");
  });

  it("cobrança pausada: deixa claro que nada é cobrado nem reativado", () => {
    const frase = scheduledChangeSentence({
      target: "premium",
      status: "awaiting_team",
      cycleEnd: null,
    });
    expect(frase).toContain("R$ 89,90/mês");
    expect(frase).toContain("pausada pela equipe");
    expect(frase).toContain("nada é cobrado antes disso");
  });

  it("do navegador só passam o plano e o aceite", () => {
    expect(
      parseScheduleInput({
        planCode: "premium_anual",
        accepted: true,
        companyId: "x",
        priceVersionId: "y",
      }),
    ).toEqual({
      planCode: "premium_anual",
      accepted: true,
    });
    expect(() => parseScheduleInput({ planCode: "premium", accepted: false })).toThrow();
    expect(() => parseScheduleInput({ planCode: "cents", accepted: true })).toThrow();
  });
});

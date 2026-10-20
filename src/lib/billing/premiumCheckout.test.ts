import { describe, expect, it } from "vitest";
import { formatCents } from "./money";
import {
  PLAN_PRICING,
  annualSavingsCents,
  annualSavingsPercentLabel,
  isPublicPlanCode,
  monthlyEquivalentCents,
} from "./plans";
import {
  buildCheckoutSummary,
  decidePremiumPurchase,
  parseStartCheckoutInput,
} from "./premiumCheckout";
import { checkoutAmountCents } from "./checkout";
import { computeCycleStartAfter } from "./trial";

describe("valores comerciais do Premium (centavos inteiros)", () => {
  it("Premium Mensal custa R$ 89,90", () => {
    expect(PLAN_PRICING.premium.cycleFeeCents).toBe(8990);
    expect(PLAN_PRICING.premium.billingIntervalMonths).toBe(1);
    expect(PLAN_PRICING.premium.name).toBe("Premium Mensal");
    expect(formatCents(PLAN_PRICING.premium.cycleFeeCents)).toBe("R$ 89,90");
  });

  it("Premium Anual cobra R$ 598,80 por 12 meses e equivale a R$ 49,90/mês", () => {
    expect(PLAN_PRICING.premium_anual.cycleFeeCents).toBe(59880);
    expect(PLAN_PRICING.premium_anual.billingIntervalMonths).toBe(12);
    expect(monthlyEquivalentCents("premium_anual")).toBe(4990);
    expect(formatCents(monthlyEquivalentCents("premium_anual"))).toBe("R$ 49,90");
  });

  it("economia de R$ 480,00 frente a 12 x R$ 89,90 e selo de 44,5%", () => {
    expect(annualSavingsCents()).toBe(48000);
    expect(formatCents(annualSavingsCents())).toBe("R$ 480,00");
    expect(annualSavingsPercentLabel()).toBe("44,5%");
  });

  it("os dois Premium são vendáveis; o interno de teste continua fora da vitrine", () => {
    expect(isPublicPlanCode("premium")).toBe(true);
    expect(isPublicPlanCode("premium_anual")).toBe(true);
    expect(isPublicPlanCode("teste")).toBe(false);
  });

  it("o checkout do anual cobra o valor integral, não o equivalente mensal", () => {
    expect(checkoutAmountCents("premium_anual")).toBe(59880);
    expect(checkoutAmountCents("premium")).toBe(8990);
  });
});

describe("resumo do checkout (transparência)", () => {
  it("anual: destaca R$ 598,80 hoje, o plano e os 12 meses", () => {
    const s = buildCheckoutSummary("premium_anual");
    expect(s.totalTodayCents).toBe(59880);
    expect(s.lines.totalToday).toBe("Total a pagar hoje: R$ 598,80");
    expect(s.lines.planContracted).toBe("Plano contratado: Premium Anual");
    expect(s.lines.accessPeriod).toBe("Período de acesso: 12 meses");
  });

  it("anual: deixa claro que R$ 49,90 é só o equivalente e que não há cobrança mensal", () => {
    const s = buildCheckoutSummary("premium_anual");
    expect(s.lines.notMonthly).toContain("R$ 49,90/mês é apenas o valor equivalente");
    expect(s.lines.notMonthly).toContain("R$ 598,80 uma única vez");
    expect(s.lines.notMonthly).toContain("não existe cobrança mensal");
  });

  it("informa a renovação ANTES do pagamento: sem débito automático, valor e como cancelar", () => {
    const anual = buildCheckoutSummary("premium_anual");
    expect(anual.renewalAmountCents).toBe(59880);
    expect(anual.lines.renewal).toContain("não é débito automático");
    expect(anual.lines.renewal).toContain("R$ 598,80/ano");
    expect(anual.lines.cancel).toContain("basta não pagar");

    const mensal = buildCheckoutSummary("premium");
    expect(mensal.totalTodayCents).toBe(8990);
    expect(mensal.lines.renewal).toContain("R$ 89,90/mês");
    expect(mensal.lines.notMonthly).toBeNull();
    expect(mensal.monthlyEquivalentCents).toBeNull();
  });
});

describe("quem pode contratar pelo painel (sem cobrança duplicada)", () => {
  it("CENTS ativo ou no grátis pode contratar qualquer Premium (caso Açaí e Love / Açaí Deus proverá)", () => {
    for (const status of ["active", "free_trial", "pending_activation"]) {
      expect(decidePremiumPurchase({ planCode: "cents", status }, "premium")).toEqual({
        ok: true,
        mode: "switch",
      });
      expect(decidePremiumPurchase({ planCode: "cents", status }, "premium_anual").ok).toBe(true);
    }
  });

  it("quem já PAGA o Premium (ex.: ADEGA, R$ 375) não é migrado nem cobrado de novo pelo painel", () => {
    const adega = { planCode: "premium", status: "active" };
    const mesmo = decidePremiumPurchase(adega, "premium");
    const anual = decidePremiumPurchase(adega, "premium_anual");
    expect(mesmo).toMatchObject({ ok: false, code: "already_premium" });
    expect(anual).toMatchObject({ ok: false, code: "premium_switch_needs_team" });
  });

  it("anual ativo também não troca sozinho para o mensal", () => {
    expect(
      decidePremiumPurchase({ planCode: "premium_anual", status: "active" }, "premium"),
    ).toMatchObject({ ok: false, code: "premium_switch_needs_team" });
  });

  it("fatura atrasada bloqueia a troca até ser paga", () => {
    for (const status of ["past_due", "suspended"]) {
      expect(decidePremiumPurchase({ planCode: "cents", status }, "premium")).toMatchObject({
        ok: false,
        code: "has_debt",
      });
    }
  });

  it("Premium Mensal no grátis pode antecipar o anual, mas não recontratar o próprio mensal", () => {
    const trial = { planCode: "premium", status: "free_trial" };
    expect(decidePremiumPurchase(trial, "premium_anual").ok).toBe(true);
    expect(decidePremiumPurchase(trial, "premium")).toMatchObject({ ok: false });
  });

  it("Premium ainda não pago pode pagar agora (mensal ou anual)", () => {
    const pendente = { planCode: "premium", status: "pending_activation" };
    expect(decidePremiumPurchase(pendente, "premium").ok).toBe(true);
    expect(decidePremiumPurchase(pendente, "premium_anual").ok).toBe(true);
  });

  it("assinatura encerrada recomeça no mesmo registro; loja sem assinatura ganha uma", () => {
    expect(decidePremiumPurchase({ planCode: "premium", status: "canceled" }, "premium")).toEqual({
      ok: true,
      mode: "switch",
    });
    expect(decidePremiumPurchase(null, "premium_anual")).toEqual({ ok: true, mode: "create" });
  });

  it("planos internos (legado, teste) só pela equipe", () => {
    expect(
      decidePremiumPurchase({ planCode: "legacy_full_access", status: "active" }, "premium"),
    ).toMatchObject({ ok: false, code: "internal_plan" });
  });
});

describe("ciclo anual no calendário", () => {
  it("o ano seguinte começa logo depois do fim gravado do ano pago (não um mês depois)", () => {
    const start = new Date("2026-10-15T13:00:00.000Z");
    const end = new Date("2027-10-15T12:59:59.999Z");
    const next = computeCycleStartAfter({
      cycleType: "usage",
      cycleStart: start,
      cycleEnd: end,
      intervalMonths: 12,
    });
    expect(next.toISOString()).toBe("2027-10-15T13:00:00.000Z");
  });

  it("o mensal continua exatamente como antes (mesmo dia do mês seguinte)", () => {
    const start = new Date("2026-10-15T13:00:00.000Z");
    const end = new Date("2026-11-15T12:59:59.999Z");
    const semIntervalo = computeCycleStartAfter({
      cycleType: "usage",
      cycleStart: start,
      cycleEnd: end,
    });
    const comIntervalo1 = computeCycleStartAfter({
      cycleType: "usage",
      cycleStart: start,
      cycleEnd: end,
      intervalMonths: 1,
    });
    expect(comIntervalo1.toISOString()).toBe(semIntervalo.toISOString());
    expect(semIntervalo.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});

describe("o navegador não decide valor nem loja", () => {
  it("descarta valor, loja e assinatura enviados pelo navegador", () => {
    const forjado = {
      planCode: "premium_anual",
      acceptedTerms: true,
      amountCents: 1,
      companyId: "loja-de-outra-pessoa",
      subscriptionId: "sub-alheia",
    };
    expect(parseStartCheckoutInput(forjado)).toEqual({
      planCode: "premium_anual",
      acceptedTerms: true,
    });
  });

  it("recusa plano que não é Premium e pedido sem aceite", () => {
    expect(() => parseStartCheckoutInput({ planCode: "cents", acceptedTerms: true })).toThrow();
    expect(() => parseStartCheckoutInput({ planCode: "teste", acceptedTerms: true })).toThrow();
    expect(() => parseStartCheckoutInput({ planCode: "premium" })).toThrow(/Confirme/);
  });
});

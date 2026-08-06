import { describe, expect, it } from "vitest";
import { PUBLIC_PLAN_CODES, isPublicPlanCode } from "./billing/plans";
import { featuresForPlan, normalizePlanType, planHasFeature } from "./planPermissions";

const RESTRICTED = ["tables", "waiters", "commissions"] as const;

describe("PREMIUM", () => {
  it("libera Mesas, Garçons e Comissões", () => {
    for (const feature of RESTRICTED) {
      expect(planHasFeature("premium", feature)).toBe(true);
    }
  });
});

describe("CENTS", () => {
  it("bloqueia Mesas, Garçons e Comissões", () => {
    for (const feature of RESTRICTED) {
      expect(planHasFeature("cents", feature)).toBe(false);
    }
    expect(featuresForPlan("cents")).toHaveLength(0);
  });
});

describe("clientes anteriores ao modelo de assinatura", () => {
  it("mantêm acesso completo em vez de serem bloqueados", () => {
    for (const feature of RESTRICTED) {
      expect(planHasFeature("legacy_full_access", feature)).toBe(true);
    }
  });

  it("um plan_type nulo ou desconhecido não derruba o acesso", () => {
    // Empresas em produção têm valores variados nesse campo. Bloquear quem já
    // paga por causa de um valor inesperado é pior do que liberar demais até
    // a migração administrativa acontecer.
    for (const value of [null, undefined, "", "basic", "enterprise", "PREMIUM"]) {
      expect(normalizePlanType(value)).toBe("legacy_full_access");
      expect(planHasFeature(value, "tables")).toBe(true);
    }
  });

  it("só CENTS restringe — é o único plano vendido com restrição", () => {
    expect(normalizePlanType("cents")).toBe("cents");
    expect(normalizePlanType("premium")).toBe("premium");
  });

  it("não aparece como terceiro plano comercial", () => {
    expect(PUBLIC_PLAN_CODES).toEqual(["premium", "cents"]);
    expect(PUBLIC_PLAN_CODES).not.toContain("legacy_full_access");
    expect(isPublicPlanCode("legacy_full_access")).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANY_BILLING_MODEL } from "./plans";

/**
 * O banco recusa a empresa quando `plan_type` e `billing_model` não formam um
 * par previsto. Como a coluna tem default `fixed`, esquecer de preenchê-la não
 * dá erro de campo faltando: dá par inválido, e só no CENTS — o PREMIUM passa
 * e ninguém percebe até um cliente escolher o outro plano.
 *
 * Foi assim que o cadastro quebrou em produção. Estes testes leem a constraint
 * do próprio arquivo de migration e comparam com o mapa do código, para que
 * uma mudança em um lado sem o outro pare aqui.
 */
const MIGRATION = "supabase/migrations/20260721221500_plans_restructure.sql";
const sql = readFileSync(MIGRATION, "utf8");

/** Extrai os pares (plan_type, billing_model) aceitos pela constraint. */
function paresAceitosNoBanco(): Record<string, string> {
  const pares: Record<string, string> = {};
  const regex = /\(\s*plan_type\s*=\s*'([^']+)'\s*AND\s*billing_model\s*=\s*'([^']+)'\s*\)/gi;

  for (const match of sql.matchAll(regex)) {
    pares[match[1]] = match[2];
  }
  return pares;
}

describe("par plano + modelo de cobrança", () => {
  it("a constraint existe na migration", () => {
    // Se ela for removida, este teste avisa antes de alguém concluir que o
    // mapa do código virou decoração.
    expect(sql).toContain("pizzerias_plan_billing_pair_check");
  });

  it("o mapa do código bate exatamente com o que o banco aceita", () => {
    expect(paresAceitosNoBanco()).toEqual({ ...COMPANY_BILLING_MODEL });
  });

  it("cobre todos os planos públicos", () => {
    expect(Object.keys(COMPANY_BILLING_MODEL).sort()).toEqual(["cents", "premium"]);
  });

  it("CENTS nunca é 'fixed'", () => {
    // Este é o valor que o default da coluna colocaria sozinho, e é
    // exatamente o que o banco recusa.
    expect(COMPANY_BILLING_MODEL.cents).not.toBe("fixed");
    expect(COMPANY_BILLING_MODEL.cents).toBe("per_order");
  });
});

describe("quem grava plano no banco também grava o modelo", () => {
  /**
   * Só os arquivos que realmente escrevem em `pizzerias`. Ler `plan_type`
   * para decidir uma tela não tem nada a ver com a constraint — a primeira
   * versão deste teste confundiu leitura com escrita e acusou os inocentes.
   */
  const gravamNoBanco = [
    "src/lib/signup/signup.functions.ts",
    "src/lib/billing/subscriptionAdmin.functions.ts",
    "src/routes/api/pizzerias.create.ts",
    "src/components/admin/dashboards/SubscriptionsDashboard.tsx",
  ];

  it.each(gravamNoBanco)("%s menciona billing_model", (arquivo) => {
    expect(readFileSync(arquivo, "utf8")).toContain("billing_model");
  });

  it.each(["src/lib/signup/signup.functions.ts", "src/lib/billing/subscriptionAdmin.functions.ts"])(
    "%s usa o mapa central, e não a regra escrita à mão",
    (arquivo) => {
      // Repetir `plan === "cents" ? "per_order" : "fixed"` em cada arquivo é o
      // que faz um deles ficar para trás quando surgir um terceiro plano.
      expect(readFileSync(arquivo, "utf8")).toContain("COMPANY_BILLING_MODEL");
    },
  );
});

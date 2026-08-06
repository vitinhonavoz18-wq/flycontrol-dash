import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O fechamento de ciclo é o único endpoint que emite fatura. Se ele ficar
 * exposto, qualquer um dispara faturamento; se ele parar no primeiro erro,
 * uma empresa com dado inconsistente trava a cobrança de todas.
 *
 * Estes testes leem o arquivo e travam as garantias estruturais — o
 * comportamento em si depende de banco ativo e não é testável aqui.
 */
const source = readFileSync("src/routes/api/billing.close-cycles.ts", "utf8");

describe("proteção do endpoint de fechamento", () => {
  it("fica desligado enquanto o segredo não estiver configurado", () => {
    // Sem segredo, um endpoint de cobrança seria porta aberta.
    expect(source).toContain("BILLING_CRON_SECRET");
    expect(source).toMatch(/if \(!expected\)[\s\S]*?503/);
  });

  it("recusa chamada sem o segredo correto", () => {
    expect(source).toMatch(/timingSafeEqual\(expected, provided\)/);
    expect(source).toContain('"unauthorized"');
  });

  it("compara o segredo em tempo constante", () => {
    // `===` vazaria o tamanho do prefixo correto pelo tempo de resposta.
    expect(source).toContain("function timingSafeEqual");
    expect(source).toMatch(/diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/);
  });

  it("aceita apenas POST", () => {
    // GET seria disparável por um link ou pré-carregamento de navegador.
    expect(source).toMatch(/handlers:\s*\{\s*POST:/);
    expect(source).not.toMatch(/\bGET:\s*async/);
  });
});

describe("robustez do processamento", () => {
  it("fecha somente ciclos já vencidos", () => {
    expect(source).toMatch(/\.eq\("status", "open"\)/);
    expect(source).toMatch(/\.lte\("cycle_end", nowIso\)/);
  });

  it("um ciclo com problema não impede o fechamento dos demais", () => {
    // Sem o try/catch por ciclo, uma empresa com dado inconsistente travaria
    // a cobrança de todas as outras.
    const loop = source.slice(source.indexOf("for (const cycle of cycles)"));
    expect(loop).toContain("try {");
    expect(loop).toContain("} catch (err) {");
  });

  it("distingue sucesso total de falha parcial no código de status", () => {
    // Um agendador que só olha o status precisa perceber falha parcial.
    expect(source).toMatch(/failed > 0 \? 207 : 200/);
  });

  it("delega o cálculo ao motor, sem recalcular preço por conta própria", () => {
    expect(source).toContain("closeBillingCycle(cycle.id)");
    expect(source).not.toMatch(/unit_price_cents\s*\*/);
    expect(source).not.toContain("calculateCycle(");
  });

  it("trata ciclo já fechado como sucesso, e não como erro", () => {
    // closeBillingCycle é idempotente: rodar o cron duas vezes no mesmo dia
    // não pode virar alarme falso.
    expect(source).toContain("result.alreadyClosed");
  });
});

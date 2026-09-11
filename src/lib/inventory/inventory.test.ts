import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { situacaoDoEstoque, ROTULO_DA_SITUACAO } from "./inventory.functions";
import { planHasFeature } from "@/lib/planPermissions";

describe("verde, laranja ou vermelho", () => {
  it("saldo acima do mínimo é estoque normal", () => {
    expect(situacaoDoEstoque({ stock_base: 30, min_stock_base: 10 })).toBe("normal");
  });

  it("saldo igual ao mínimo JÁ conta como baixo", () => {
    // O mínimo é o ponto de repor, não o ponto de acabar. Avisar só depois de
    // passar seria avisar tarde.
    expect(situacaoDoEstoque({ stock_base: 10, min_stock_base: 10 })).toBe("baixo");
  });

  it("saldo abaixo do mínimo é baixo", () => {
    expect(situacaoDoEstoque({ stock_base: 4, min_stock_base: 5 })).toBe("baixo");
  });

  it("zero é sem estoque, não baixo", () => {
    expect(situacaoDoEstoque({ stock_base: 0, min_stock_base: 5 })).toBe("sem_estoque");
  });

  it("saldo negativo também é sem estoque", () => {
    // Loja que vende a descoberto pode ficar negativa; para a tela, continua
    // sendo "acabou".
    expect(situacaoDoEstoque({ stock_base: -3, min_stock_base: 5 })).toBe("sem_estoque");
  });

  it("sem mínimo configurado, só avisa quando acaba de verdade", () => {
    // Mínimo zero significa "não me avise": marcar como baixo aqui encheria a
    // tela de alerta de produto que o dono nem controla.
    expect(situacaoDoEstoque({ stock_base: 1, min_stock_base: 0 })).toBe("normal");
    expect(situacaoDoEstoque({ stock_base: 0, min_stock_base: 0 })).toBe("sem_estoque");
  });

  it("toda situação tem um texto, para não depender só da cor", () => {
    for (const s of ["sem_estoque", "baixo", "normal"] as const) {
      expect(ROTULO_DA_SITUACAO[s]).toBeTruthy();
    }
  });
});

describe("o módulo é exclusivo do Premium", () => {
  it("Premium tem acesso", () => {
    expect(planHasFeature("premium", "inventory")).toBe(true);
  });

  it("CENTS não tem acesso", () => {
    expect(planHasFeature("cents", "inventory")).toBe(false);
  });

  it("quem já era cliente antes da cobrança mantém o acesso", () => {
    // Mesma decisão que vale para Mesas e Garçons: derrubar o acesso de quem
    // já paga seria um estrago maior do que liberar até a migração.
    expect(planHasFeature("legacy_full_access", "inventory")).toBe(true);
  });
});

describe("a tranca não fica só na tela", () => {
  const fonte = readFileSync("src/lib/inventory/inventory.functions.ts", "utf8");

  it("toda função de servidor do módulo confere dono e plano", () => {
    // Conta quantas funções de servidor existem e quantas chamam o porteiro.
    // Se alguém acrescentar uma função nova e esquecer a conferência, este
    // teste quebra — que é exatamente o dia em que o esquecimento importa.
    const funcoes = fonte.match(/createServerFn\(/g)?.length ?? 0;
    const guardas = fonte.match(/await assertEstoque\(/g)?.length ?? 0;
    expect(funcoes).toBeGreaterThan(0);
    expect(guardas).toBe(funcoes);
  });

  it("a tela não altera saldo por fora do motor do banco", () => {
    // Nenhum UPDATE direto em stock_base: quem mexe no saldo é a função
    // inventory_apply_movement, que grava o extrato junto.
    expect(fonte).not.toMatch(/update\([^)]*stock_base/i);
  });
});

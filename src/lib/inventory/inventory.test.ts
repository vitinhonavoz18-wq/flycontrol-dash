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

  it("o nome da função do banco nunca vem de fora", () => {
    // `rpcDaFase6` existe porque o arquivo de tipos é mais antigo que as
    // funções da Fase 6. O atalho é aceitável enquanto o nome for uma
    // constante escrita no código; se algum dia ele passar a vir do que o
    // navegador manda, vira uma porta para chamar qualquer função do banco.
    const bloco = fonte.slice(
      fonte.indexOf("function rpcDaFase6("),
      fonte.indexOf(
        "// ============================================================================\n// ENTRADA DE MERCADORIA",
      ),
    );
    const parametroNome = bloco.match(/nome:\s*([\s\S]*?),\n\s*argumentos:/)?.[1] ?? "";

    expect(parametroNome).toContain('"inventory_register_entry"');
    expect(parametroNome).toContain('"inventory_start_count"');
    expect(parametroNome).toContain('"inventory_apply_count"');
    // O tipo é a lista fechada de nomes, e não `string` — que aceitaria
    // qualquer função do banco vinda de fora.
    expect(parametroNome).not.toMatch(/\bstring\b/);
  });
});

/**
 * As operações da Fase 6 mexem em dinheiro e em saldo. Estes testes olham o
 * SQL aplicado, porque é lá que as regras moram — e uma regra perdida aqui só
 * apareceria no dia do acerto de estoque, com o prejuízo já feito.
 */
describe("entrada de mercadoria e contagem", () => {
  const sql = readFileSync(
    "supabase/migrations/20260911220000_estoque_entradas_e_inventario.sql",
    "utf8",
  );

  it("a contagem compara com o saldo de AGORA, não com o congelado", () => {
    // Entre abrir e fechar a contagem o restaurante continuou vendendo. Usar o
    // saldo congelado apagaria essas vendas ao aplicar o acerto.
    expect(sql).toMatch(/SELECT stock_base INTO v_saldo_atual/);
    expect(sql).toMatch(/v_item\.counted_quantity_base - v_saldo_atual/);
  });

  it("produto sem contagem não é tocado", () => {
    // Contagem parcial é comum (conferir só as bebidas numa terça). Zerar o
    // que não foi contado transformaria a conferência em estrago.
    expect(sql).toMatch(/counted_quantity_base IS NOT NULL/);
  });

  it("a diferença vira movimentação, nunca UPDATE no saldo", () => {
    expect(sql).toMatch(/inventory_apply_movement\(/);
    expect(sql).not.toMatch(/UPDATE inventory_products\s+SET stock_base/i);
  });

  it("duas contagens abertas ao mesmo tempo são recusadas", () => {
    // A segunda a ser aplicada desfaria o acerto da primeira.
    expect(sql).toContain("CONTAGEM_JA_ABERTA");
  });

  it("clicar duas vezes não lança a mesma nota duas vezes", () => {
    expect(sql).toMatch(/idempotency_key/);
    expect(sql).toMatch(/'repetida',\s*TRUE/);
  });

  it("a entrada recusa item sem quantidade em vez de lançar zero", () => {
    expect(sql).toContain("QUANTIDADE_INVALIDA");
  });

  it("o produto da entrada precisa ser da própria loja", () => {
    // Sem esta conferência, bastaria mandar o código de um produto do vizinho
    // para fazer entrar mercadoria no estoque dele.
    expect(sql).toMatch(/AND pizzeria_id = p_pizzeria_id/);
  });
});

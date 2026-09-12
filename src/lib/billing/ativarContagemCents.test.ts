import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Esta função liga a cobrança de um cliente real. Os testes olham o
 * código-fonte porque o que precisa ser garantido aqui são as TRAVAS — e uma
 * trava removida por engano só apareceria na fatura de alguém.
 */
describe("ligar a contagem do CENTS", () => {
  const fonte = readFileSync("src/lib/billing/ativarContagemCents.functions.ts", "utf8");

  it("confere o dono antes de qualquer escrita", () => {
    // O código da loja chega do navegador. Sem esta conferência, bastaria
    // trocar o número para ligar a cobrança na loja do vizinho.
    const antesDaPrimeiraEscrita = fonte.slice(0, fonte.indexOf(".insert("));
    expect(antesDaPrimeiraEscrita).toContain("await assertOwnsTenant(");
  });

  it("sai sem fazer nada quando já existe ciclo aberto", () => {
    // Dois ciclos abertos fariam o mesmo pedido ser contado duas vezes. Esta
    // saída precisa vir ANTES de qualquer insert.
    const guarda = fonte.indexOf("current_cycle_id) return");
    expect(guarda).toBeGreaterThan(0);
    expect(guarda).toBeLessThan(fonte.indexOf(".insert("));
  });

  it("não religa assinatura cancelada ou suspensa", () => {
    // Voltar a cobrar quem pediu para sair é decisão humana, não efeito
    // colateral de abrir uma tela.
    expect(fonte).toMatch(/\["active",\s*"pending_activation"\]\.includes\(atual\.status\)/);
  });

  it("só age em loja CENTS e ativa", () => {
    expect(fonte).toContain('ficha.plan_type !== "cents"');
    expect(fonte).toContain('ficha.status !== "active"');
  });

  it("nunca cobra o que passou", () => {
    // O ciclo abre a partir de agora. Se algum dia alguém quiser lançar
    // consumo retroativo, vai ter de mexer aqui — e neste teste junto.
    expect(fonte).toContain("retroativo: false");
    expect(fonte).not.toMatch(/usage_events/);
  });

  it("deixa rastro de quem ligou e por quê", () => {
    // Fatura que aparece sem explicação vira ligação do cliente. O evento
    // registra a origem para quem for conferir depois.
    expect(fonte).toContain("subscription_events");
    expect(fonte).toContain("cents_counting_started");
  });
});

/**
 * RISCO ACEITO CONSCIENTEMENTE
 *
 * O contador de consumo (`record_order_usage`, no banco) não distingue pedido
 * de teste de pedido real: ele conta qualquer pedido faturável, inclusive os
 * que chegam com `source = 'test'`.
 *
 * Isso já causou um susto: a EMILY BURGUER tinha 450 pedidos de teste de carga
 * que, se a contagem estivesse ligada, teriam virado cerca de R$ 268 de fatura
 * para uma loja que fez 17 pedidos de verdade.
 *
 * A decisão foi manter como está, com o combinado de não rodar teste de carga
 * em loja de cliente com a contagem ligada. Este teste existe para que a
 * decisão fique VISÍVEL no código: se alguém mudar de ideia, o caminho está
 * escrito aqui.
 */
describe("pedido de teste e cobrança", () => {
  it("o contador ainda não filtra pedido de teste — decisão registrada", () => {
    const fonte = readFileSync("src/lib/billing/ativarContagemCents.functions.ts", "utf8");
    // Se um dia o filtro entrar, este teste quebra e o comentário acima deve
    // ser atualizado junto.
    expect(fonte).not.toContain("source = 'test'");
  });
});

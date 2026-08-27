import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhoneForDisplay } from "./phone";
import {
  renderizarMensagem,
  variaveisUsadas,
  variaveisDesconhecidas,
  primeiroNome,
} from "./templateVars";
import { construirFiltro, descreverSegmento, type FiltroSegmento } from "./segments";

describe("normalizePhone — o mesmo cliente não pode virar dois", () => {
  it("trata os três jeitos de escrever o mesmo celular como um só", () => {
    const escritas = ["(71) 99999-1234", "71999991234", "+55 71 99999-1234", "071 99999-1234"];
    const saidas = escritas.map((e) => normalizePhone(e)?.e164);
    expect(new Set(saidas)).toEqual(new Set(["5571999991234"]));
  });

  it("reconhece celular e fixo", () => {
    expect(normalizePhone("71999991234")?.isMobile).toBe(true);
    expect(normalizePhone("7133334444")?.isMobile).toBe(false);
  });

  it("recusa número estrangeiro em vez de fingir que é brasileiro", () => {
    // Sem esta regra, o +1 vira 5514155552671 e a promoção do restaurante
    // sai para o telefone de um desconhecido nos Estados Unidos.
    expect(normalizePhone("+1 415 555 2671")).toBeNull();
    expect(normalizePhone("+351 912 345 678")).toBeNull();
  });

  it("recusa o que não é telefone", () => {
    for (const lixo of ["", "   ", "123", "abc", "00 71 99999 1234", null, undefined]) {
      expect(normalizePhone(lixo)).toBeNull();
    }
  });

  it("recusa DDD que não existe", () => {
    expect(normalizePhone("01999991234")).toBeNull();
    expect(normalizePhone("10999991234")).toBeNull();
  });

  it("mostra bonito na tela sem mudar o que está guardado", () => {
    expect(formatPhoneForDisplay("5571999991234")).toBe("(71) 99999-1234");
    expect(formatPhoneForDisplay("557133334444")).toBe("(71) 3333-4444");
    expect(formatPhoneForDisplay(null)).toBe("—");
  });
});

describe("renderizarMensagem — variável é texto, nunca comando", () => {
  it("troca o que conhece", () => {
    const saida = renderizarMensagem("Oi {{primeiro_nome}}, use {{cupom}} no {{link_cardapio}}", {
      primeiro_nome: "Ana",
      cupom: "VOLTE15",
      link_cardapio: "https://exemplo.com",
    });
    expect(saida).toBe("Oi Ana, use VOLTE15 no https://exemplo.com");
  });

  it("NÃO deixa o valor de uma variável virar outra variável", () => {
    // Um cliente cadastrado com o nome "{{cupom}}" não pode fazer o sistema
    // colar um cupom de verdade na mensagem dele.
    const saida = renderizarMensagem("Oi {{nome}}, tudo bem?", {
      nome: "{{cupom}}",
      cupom: "DESCONTO90",
    });
    expect(saida).toContain("{{cupom}}");
    expect(saida).not.toContain("DESCONTO90");
  });

  it("dá saída digna quando falta valor, sem deixar buraco na frase", () => {
    expect(renderizarMensagem("Oi {{primeiro_nome}}!", {})).toBe("Oi cliente!");
    expect(renderizarMensagem("Use {{cupom}} hoje", { cupom: "" })).toBe("Use hoje");
  });

  it("deixa à mostra a variável que o dono digitou errado", () => {
    const saida = renderizarMensagem("Oi {{nomee}}", { nome: "Ana" });
    expect(saida).toBe("Oi {{nomee}}");
    expect(variaveisDesconhecidas("Oi {{nomee}}")).toEqual(["nomee"]);
  });

  it("aceita espaço dentro das chaves", () => {
    expect(renderizarMensagem("Oi {{ primeiro_nome }}", { primeiro_nome: "Ana" })).toBe("Oi Ana");
  });

  it("lista o que foi usado", () => {
    expect(variaveisUsadas("{{nome}} e {{cupom}} e {{nome}}").sort()).toEqual(["cupom", "nome"]);
  });

  it("primeiro nome", () => {
    expect(primeiroNome("Ana Paula Ribeiro")).toBe("Ana");
    expect(primeiroNome("  ")).toBe("");
  });
});

describe("segmentação — quem entra na campanha", () => {
  it("descreve o público em português, não em jargão", () => {
    expect(descreverSegmento({ tipo: "inativos", dias: 30 })).toContain("30 dias");
    expect(descreverSegmento({ tipo: "todos" })).toBeTruthy();
  });

  it("o filtro de inativos vira uma data de corte, não uma contagem", () => {
    const f = construirFiltro({ tipo: "inativos", dias: 30 });
    expect(f.lastOrderBefore).toBeTruthy();
    const corte = new Date(f.lastOrderBefore!);
    const diasAtras = Math.round((Date.now() - corte.getTime()) / 86_400_000);
    expect(diasAtras).toBe(30);
  });

  it("valor gasto é convertido para centavos inteiros", () => {
    const f = construirFiltro({ tipo: "valor_gasto", minReais: 100 });
    expect(f.minSpentCents).toBe(10_000);
  });

  it("intervalo de pedidos vira mínimo e máximo", () => {
    const f = construirFiltro({ tipo: "quantidade_pedidos", min: 2, max: 10 });
    expect(f.minOrders).toBe(2);
    expect(f.maxOrders).toBe(10);
  });

  it("todo filtro exige consentimento — nunca dá para burlar pelo tipo", () => {
    const tipos: FiltroSegmento[] = [
      { tipo: "todos" },
      { tipo: "inativos", dias: 15 },
      { tipo: "valor_gasto", minReais: 50 },
      { tipo: "quantidade_pedidos", min: 1 },
      { tipo: "tags", tags: ["vip"] },
    ];
    for (const t of tipos) {
      expect(construirFiltro(t).requireOptIn).toBe(true);
    }
  });
});

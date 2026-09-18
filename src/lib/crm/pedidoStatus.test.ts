import { describe, expect, it } from "vitest";
import {
  situacaoValida,
  emAndamento,
  podeSerAlteradoPelaIa,
  frasePara,
  FALA_DO_CLIENTE,
  ROTULO_PAINEL,
} from "./pedidoStatus";

describe("a situação do pedido", () => {
  it("entende as situações que o sistema usa de verdade", () => {
    for (const s of ["novo", "preparando", "saiu", "entregue", "cancelado"]) {
      expect(situacaoValida(s)).toBe(s);
    }
  });

  it("aceita escrito com maiúscula ou com espaço sobrando", () => {
    expect(situacaoValida(" Preparando ")).toBe("preparando");
  });

  it("pedido apagado não existe para o cliente", () => {
    // `deleted` é lixeira do lojista, não situação de pedido.
    expect(situacaoValida("deleted")).toBeNull();
    expect(emAndamento("deleted")).toBe(false);
  });

  it("situação desconhecida não vira invenção", () => {
    expect(situacaoValida("voando")).toBeNull();
    expect(situacaoValida(null)).toBeNull();
  });

  it("em andamento é o que ainda não terminou", () => {
    expect(emAndamento("novo")).toBe(true);
    expect(emAndamento("preparando")).toBe(true);
    expect(emAndamento("saiu")).toBe(true);
    expect(emAndamento("entregue")).toBe(false);
    expect(emAndamento("cancelado")).toBe(false);
  });
});

describe("até onde a IA pode mexer", () => {
  it("só enquanto a cozinha não começou", () => {
    // Mudar o pedido depois do preparo é mandar jogar comida fora — e a
    // cozinha não lê WhatsApp.
    expect(podeSerAlteradoPelaIa("novo")).toBe(true);
    expect(podeSerAlteradoPelaIa("preparando")).toBe(false);
    expect(podeSerAlteradoPelaIa("saiu")).toBe(false);
    expect(podeSerAlteradoPelaIa("entregue")).toBe(false);
    expect(podeSerAlteradoPelaIa("cancelado")).toBe(false);
  });
});

describe("a frase que a IA lê para o cliente", () => {
  it("fala em português de gente, não em palavra de sistema", () => {
    const f = frasePara(42, "saiu", null);
    expect(f).toContain("#42");
    expect(f).toContain("saiu para entrega");
    expect(f).not.toContain("status");
  });

  it("situação que não existe vira 'vou confirmar', não um chute", () => {
    expect(frasePara(42, "voando", null)).toContain("confirmar com a equipe");
  });

  it("sem número do pedido ainda faz sentido", () => {
    expect(frasePara(null, "preparando", null)).toContain("Seu pedido");
  });

  it("toda situação tem fala para o cliente e rótulo para o painel", () => {
    expect(Object.keys(FALA_DO_CLIENTE).sort()).toEqual(Object.keys(ROTULO_PAINEL).sort());
  });
});

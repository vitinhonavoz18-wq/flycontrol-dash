import { describe, it, expect } from "vitest";
import { quemFalou, ladoDireito, NOME_AUTORIA } from "./autoria";

const EU = "11111111-1111-1111-1111-111111111111";
const COLEGA = "22222222-2222-2222-2222-222222222222";

describe("quem falou na conversa", () => {
  it("mensagem que chegou é sempre do cliente", () => {
    expect(quemFalou({ direction: "in", sent_by: null }, EU)).toBe("cliente");
    // Mesmo que venha com assinatura por engano, quem chega é o cliente.
    expect(quemFalou({ direction: "in", sent_by: EU }, EU)).toBe("cliente");
  });

  it("resposta sem assinatura é da IA", () => {
    expect(quemFalou({ direction: "out", sent_by: null }, EU)).toBe("ia");
    expect(quemFalou({ direction: "out" }, EU)).toBe("ia");
  });

  it("resposta assinada por mim sou eu", () => {
    expect(quemFalou({ direction: "out", sent_by: EU }, EU)).toBe("voce");
  });

  it("resposta assinada por outra pessoa é da equipe", () => {
    expect(quemFalou({ direction: "out", sent_by: COLEGA }, EU)).toBe("equipe");
  });

  it("sem saber quem sou eu, não chama ninguém de 'você'", () => {
    expect(quemFalou({ direction: "out", sent_by: EU }, null)).toBe("equipe");
  });

  it("só o cliente fica do lado esquerdo", () => {
    expect(ladoDireito("cliente")).toBe(false);
    expect(ladoDireito("voce")).toBe(true);
    expect(ladoDireito("equipe")).toBe(true);
    expect(ladoDireito("ia")).toBe(true);
  });

  it("os quatro têm nomes diferentes na tela", () => {
    const nomes = Object.values(NOME_AUTORIA);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

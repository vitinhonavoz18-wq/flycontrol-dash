import { describe, expect, it } from "vitest";
import { abaDoEndereco } from "./abaDoEndereco";

/**
 * O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR
 *
 * As abas de "Minha Loja" e do "Cardápio" pararam de trocar. O endereço dizia
 * `?aba=delivery`, a aba acendia ao ser clicada, e o conteúdo embaixo
 * continuava o mesmo — o lojista clicando e nada acontecendo.
 *
 * A causa: o roteador entrega a busca como OBJETO, e a leitura só sabia ler
 * TEXTO. O `: ""` de segurança fez o erro virar silêncio.
 */
describe("ler a aba do endereço", () => {
  describe("quando vem como objeto — a forma que o roteador usa", () => {
    it("acha a aba", () => {
      expect(abaDoEndereco({ aba: "delivery" }, "identity")).toBe("delivery");
    });

    it("preserva os outros parâmetros sem se confundir", () => {
      expect(abaDoEndereco({ pizzeriaId: "abc-123", aba: "service" }, "identity")).toBe("service");
    });

    it("sem aba, devolve a padrão", () => {
      expect(abaDoEndereco({ pizzeriaId: "abc-123" }, "identity")).toBe("identity");
      expect(abaDoEndereco({}, "categories")).toBe("categories");
    });

    it("aba vazia ou em branco não vale", () => {
      expect(abaDoEndereco({ aba: "" }, "identity")).toBe("identity");
      expect(abaDoEndereco({ aba: "   " }, "identity")).toBe("identity");
    });

    it("aba que não é texto não vale", () => {
      expect(abaDoEndereco({ aba: 3 }, "identity")).toBe("identity");
      expect(abaDoEndereco({ aba: null }, "identity")).toBe("identity");
      expect(abaDoEndereco({ aba: ["a", "b"] }, "identity")).toBe("identity");
    });
  });

  describe("quando vem como texto", () => {
    it("acha a aba, com e sem interrogação", () => {
      expect(abaDoEndereco("?aba=extras", "categories")).toBe("extras");
      expect(abaDoEndereco("aba=extras", "categories")).toBe("extras");
    });

    it("entende endereço com vários parâmetros", () => {
      expect(abaDoEndereco("?pizzeriaId=abc&aba=delivery", "identity")).toBe("delivery");
    });

    it("texto vazio devolve a padrão", () => {
      expect(abaDoEndereco("", "identity")).toBe("identity");
      expect(abaDoEndereco("?pizzeriaId=abc", "identity")).toBe("identity");
    });

    it("entende acento escapado no endereço", () => {
      expect(abaDoEndereco("?aba=servi%C3%A7o", "identity")).toBe("serviço");
    });
  });

  describe("quando vem qualquer outra coisa", () => {
    it("devolve a padrão em vez de quebrar", () => {
      // Nunca deve estourar: uma tela sem aba é ruim, uma tela em branco é pior.
      for (const lixo of [null, undefined, 42, true, [], () => {}]) {
        expect(abaDoEndereco(lixo, "identity")).toBe("identity");
      }
    });
  });
});

import { describe, expect, it } from "vitest";
import { montarAvisoAutomatico } from "./mensagem";

/**
 * O aviso que sai sozinho, sem o dono ver antes.
 *
 * O ESTRAGO QUE ESTES TESTES EVITAM: uma tapiocaria mandando "seu pedido
 * entrou no forno 🍕" com a arte de pizza de fábrica, em nome dela, para o
 * cliente — sem ninguém ter escolhido isso.
 */
describe("aviso automático de pedido", () => {
  it("usa o texto da loja, com o número do pedido no lugar", () => {
    const r = montarAvisoAutomatico(
      { status_text_saiu: "Saiu! Pedido #{NUMERO}" },
      "saiu",
      42,
      "Ana",
    );
    expect(r.texto).toBe("Saiu! Pedido #42");
  });

  it("sem texto da loja, usa o neutro — nada de pizza", () => {
    const r = montarAvisoAutomatico({}, "preparando", 7, "");
    expect(r.texto).toContain("Pedido #7");
    expect(r.texto).not.toMatch(/pizza|forno|🍕/i);
  });

  it("sem arte da loja, sai só texto (a arte de fábrica não vai)", () => {
    expect(montarAvisoAutomatico({}, "entregue", 1, "").imagemUrl).toBeNull();
    expect(montarAvisoAutomatico(null, "entregue", 1, "").imagemUrl).toBeNull();
  });

  it("com arte da loja, a arte vai junto", () => {
    const r = montarAvisoAutomatico(
      { status_art_entregue_url: "https://exemplo.com/arte.png" },
      "entregue",
      1,
      "",
    );
    expect(r.imagemUrl).toBe("https://exemplo.com/arte.png");
  });

  it("troca o nome do cliente quando o texto pede", () => {
    const r = montarAvisoAutomatico(
      { status_text_preparando: "Oi {NOME}, pedido #{NUMERO} em preparo" },
      "preparando",
      3,
      "João",
    );
    expect(r.texto).toBe("Oi João, pedido #3 em preparo");
  });
});

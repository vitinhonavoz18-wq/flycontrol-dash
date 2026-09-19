import { describe, expect, it } from "vitest";
import { escolherAparelho } from "./aparelho";

/**
 * O DEFEITO QUE ESTES TESTES SEGURAM
 *
 * O botão "Enviar ao cliente" caía sempre no modo manual e a arte nunca ia
 * junto — porque o FlyStatus procurava o aparelho numa gaveta, e o WhatsApp
 * que o lojista ligou pelo QR Code do Chat estava guardado em outra.
 */
describe("de qual WhatsApp sai a atualização do pedido", () => {
  const base = "https://api.uazapi.com";

  it("usa o aparelho da PRÓPRIA LOJA quando ela ligou o dela pelo QR Code", () => {
    const r = escolherAparelho({
      baseUrl: base,
      tokenDaLoja: "token-da-loja",
      tokenGeral: "token-geral",
      instanciaGeral: "inst-geral",
    });
    expect(r).toEqual({ baseUrl: base, token: "token-da-loja", instancia: null, origem: "loja" });
  });

  it("cai para o aparelho geral quando a loja ainda não ligou o dela", () => {
    const r = escolherAparelho({
      baseUrl: base,
      tokenDaLoja: "   ",
      tokenGeral: "token-geral",
      instanciaGeral: "inst-geral",
    });
    expect(r).toEqual({
      baseUrl: base,
      token: "token-geral",
      instancia: "inst-geral",
      origem: "geral",
    });
  });

  // Token sem endereço é chave sem porta.
  it("sem o endereço do fornecedor, não manda nada", () => {
    expect(
      escolherAparelho({
        baseUrl: "",
        tokenDaLoja: "token-da-loja",
        tokenGeral: "",
        instanciaGeral: "",
      }),
    ).toBeNull();
  });

  // O aparelho geral precisa dos dois: o token diz quem fala, a instância diz
  // por qual número. Meio conjunto manda a mensagem pelo número errado.
  it("aparelho geral pela metade não vale", () => {
    expect(
      escolherAparelho({
        baseUrl: base,
        tokenDaLoja: null,
        tokenGeral: "token-geral",
        instanciaGeral: null,
      }),
    ).toBeNull();
    expect(
      escolherAparelho({
        baseUrl: base,
        tokenDaLoja: null,
        tokenGeral: null,
        instanciaGeral: "inst-geral",
      }),
    ).toBeNull();
  });

  it("tira a barra sobrando do fim do endereço", () => {
    expect(
      escolherAparelho({
        baseUrl: "https://api.uazapi.com///",
        tokenDaLoja: "t",
        tokenGeral: null,
        instanciaGeral: null,
      })?.baseUrl,
    ).toBe(base);
  });
});

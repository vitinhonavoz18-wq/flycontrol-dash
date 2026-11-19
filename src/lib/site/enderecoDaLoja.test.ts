import { describe, expect, it } from "vitest";
import {
  avisoDoEndereco,
  ENDERECO_BASE,
  destinoDoLinkDaLoja,
  linkDaMesa,
  linkDoCardapio,
  ENDERECO_MAX,
  enderecoAtualDoLink,
  normalizarEndereco,
  podeSalvar,
  problemaDeFormato,
  situacaoConhecida,
} from "./enderecoDaLoja";

/**
 * Cópia da regra do SiteCreatorFly (src/lib/site/storeAddress.test.ts lá),
 * com os MESMOS exemplos. Se um lado mudar e o outro não, o painel mostraria
 * uma prévia diferente do endereço que o site grava.
 */
describe("normalização do endereço (igual ao SiteCreatorFly)", () => {
  it.each([
    ["Açaí e Love", "acai-e-love"],
    ["AÇAI E LOVE ", "acai-e-love"],
    ["  Pizza   da Nonna!! ", "pizza-da-nonna"],
    ["D’Lua Doces", "dlua-doces"],
    ["acai_e.love", "acai-e-love"],
    ["--acai--love--", "acai-love"],
    ["Pão & Cia", "pao-cia"],
    ["acaielove", "acaielove"],
    ["ÇÃÕÉ", "caoe"],
    ["", ""],
  ])("%j vira %j", (entrada, saida) => {
    expect(normalizarEndereco(entrada)).toBe(saida);
  });

  it("nunca passa do tamanho máximo nem termina em traço", () => {
    const r = normalizarEndereco("a".repeat(39) + " bcd");
    expect(r.length).toBeLessThanOrEqual(ENDERECO_MAX);
    expect(r.endsWith("-")).toBe(false);
  });
});

describe("formato (igual ao SiteCreatorFly)", () => {
  it("aceita e recusa os mesmos casos", () => {
    expect(problemaDeFormato("acai-e-love")).toBeNull();
    expect(problemaDeFormato("123")).toBeNull();
    expect(problemaDeFormato("ab")).toBe("too_short");
    expect(problemaDeFormato("a".repeat(41))).toBe("too_long");
    expect(problemaDeFormato("-acai")).toBe("invalid_format");
    expect(problemaDeFormato("acai--love")).toBe("invalid_format");
    expect(problemaDeFormato("Acai")).toBe("invalid_format");
  });
});

describe("o que a tela mostra", () => {
  it("só deixa salvar o que está livre (ou já foi da loja)", () => {
    expect(podeSalvar("available")).toBe(true);
    expect(podeSalvar("yours")).toBe(true);
    expect(podeSalvar("taken")).toBe(false);
    expect(podeSalvar("reserved")).toBe(false);
    expect(podeSalvar("test_pattern")).toBe(false);
    expect(podeSalvar("invalid_format")).toBe(false);
    expect(podeSalvar(null)).toBe(false);
  });

  it("usa as três mensagens combinadas com o dono", () => {
    expect(avisoDoEndereco("available").texto).toBe("Disponível");
    expect(avisoDoEndereco("taken").texto).toBe("Já está em uso, tente uma variação");
    expect(avisoDoEndereco("invalid_format").texto).toMatch(/^Formato inválido/);
    expect(avisoDoEndereco("too_short").texto).toMatch(/^Formato inválido/);
  });

  it("ignora situação desconhecida vinda do servidor", () => {
    expect(situacaoConhecida("taken")).toBe("taken");
    expect(situacaoConhecida("hackeado")).toBeNull();
    expect(situacaoConhecida(42)).toBeNull();
  });

  it("lê o endereço atual do link gravado", () => {
    expect(enderecoAtualDoLink("https://conectfly.com.br/teste-001-5srj")).toBe("teste-001-5srj");
    expect(enderecoAtualDoLink("https://conectfly.com.br/AcaieLove/")).toBe("acaielove");
    expect(enderecoAtualDoLink(null)).toBeNull();
    expect(enderecoAtualDoLink("lixo")).toBeNull();
  });
});

describe("link oficial do cardápio (cardapio.flydelivery.app)", () => {
  it("converte o link antigo gravado no banco, mantendo o caminho e a mesa", () => {
    expect(linkDoCardapio("https://conectfly.com.br/pizzaria-do-joao")).toBe(
      "https://cardapio.flydelivery.app/pizzaria-do-joao",
    );
    expect(linkDoCardapio("https://www.conectfly.com.br/joao?mesa=3")).toBe(
      "https://cardapio.flydelivery.app/joao?mesa=3",
    );
  });

  it("mantém link já novo e domínio próprio da loja como estão", () => {
    expect(linkDoCardapio("https://cardapio.flydelivery.app/joao")).toBe(
      "https://cardapio.flydelivery.app/joao",
    );
    expect(linkDoCardapio("https://pizzariadojoao.com.br")).toBe("https://pizzariadojoao.com.br");
  });

  it("sem link gravado, monta pelo slug; sem nada, devolve null", () => {
    expect(linkDoCardapio(null, "joao")).toBe("https://cardapio.flydelivery.app/joao");
    expect(linkDoCardapio("  ", "joao")).toBe("https://cardapio.flydelivery.app/joao");
    expect(linkDoCardapio("não é link", "joao")).toBe("https://cardapio.flydelivery.app/joao");
    expect(linkDoCardapio(null, null)).toBeNull();
  });

  it("QR Code da mesa sai no endereço oficial, no formato que o cardápio lê", () => {
    const link = linkDaMesa("joao", "4", "tok-123");
    expect(link).toBe(
      "https://cardapio.flydelivery.app/joao?mode=table&table_number=4&table_token=tok-123",
    );
    const url = new URL(link);
    expect(url.searchParams.get("table_token")).toBe("tok-123");
  });

  it("o endereço base mostrado ao lojista é o novo", () => {
    expect(ENDERECO_BASE).toBe("cardapio.flydelivery.app");
    expect(enderecoAtualDoLink("https://conectfly.com.br/joao")).toBe("joao");
    expect(enderecoAtualDoLink("https://cardapio.flydelivery.app/joao")).toBe("joao");
  });
});

describe("flydelivery.app/loja/<loja> sem o app", () => {
  it("leva para o cardápio online da loja, mantendo a campanha", () => {
    expect(destinoDoLinkDaLoja("pizzaria-gt")).toBe("https://cardapio.flydelivery.app/pizzaria-gt");
    expect(destinoDoLinkDaLoja("Pizzaria-GT", "?utm_source=instagram")).toBe(
      "https://cardapio.flydelivery.app/pizzaria-gt?utm_source=instagram",
    );
  });

  it("apelido estranho vai para a página inicial, nunca para fora", () => {
    for (const ruim of ["", "..", "a/b", "//golpe.com", "x?y", "-abc", "abc-", "çã"]) {
      expect(destinoDoLinkDaLoja(ruim)).toBe("https://flydelivery.app/");
    }
  });
});

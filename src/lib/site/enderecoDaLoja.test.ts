import { describe, expect, it } from "vitest";
import {
  avisoDoEndereco,
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

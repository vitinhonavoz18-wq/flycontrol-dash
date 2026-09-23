import { describe, expect, it } from "vitest";
import { checklist, lerPrecoPromocional, percentualDeDesconto } from "./vitrine";

describe("lerPrecoPromocional", () => {
  it("vazio é sem promoção", () => {
    expect(lerPrecoPromocional("", 29.9)).toEqual({ ok: true, valor: null });
    expect(lerPrecoPromocional("   ", 29.9)).toEqual({ ok: true, valor: null });
  });

  it("aceita vírgula, ponto e R$", () => {
    expect(lerPrecoPromocional("22,90", 29.9)).toEqual({ ok: true, valor: 22.9 });
    expect(lerPrecoPromocional("22.90", 29.9)).toEqual({ ok: true, valor: 22.9 });
    expect(lerPrecoPromocional("R$ 22,90", 29.9)).toEqual({ ok: true, valor: 22.9 });
    expect(lerPrecoPromocional("1.200,50", 1500)).toEqual({ ok: true, valor: 1200.5 });
  });

  it("recusa promoção igual ou maior que o preço", () => {
    expect(lerPrecoPromocional("29,90", 29.9).ok).toBe(false);
    expect(lerPrecoPromocional("30", 29.9).ok).toBe(false);
  });

  it("recusa zero, negativo e texto", () => {
    expect(lerPrecoPromocional("0", 29.9).ok).toBe(false);
    expect(lerPrecoPromocional("-5", 29.9).ok).toBe(false);
    expect(lerPrecoPromocional("abc", 29.9).ok).toBe(false);
  });

  it("não se engana com arredondamento", () => {
    expect(lerPrecoPromocional("29,89", 29.9)).toEqual({ ok: true, valor: 29.89 });
  });
});

describe("checklist", () => {
  it("tudo certo quando não há pendências", () => {
    expect(checklist([]).every((l) => l.ok)).toBe(true);
  });

  it("promoção maior que o preço marca a linha do preço promocional", () => {
    const linha = checklist(["promo_not_lower"]).find((l) => l.rotulo === "Preço promocional")!;
    expect(linha.ok).toBe(false);
    expect(linha.motivo).toMatch(/menor/);
  });

  it("sem foto marca só a foto", () => {
    const itens = checklist(["no_photo"]);
    expect(itens.filter((l) => !l.ok).map((l) => l.rotulo)).toEqual(["Foto cadastrada"]);
  });
});

describe("percentualDeDesconto", () => {
  it("calcula e arredonda", () => {
    expect(percentualDeDesconto(29.9, 22.9)).toBe(23);
    expect(percentualDeDesconto(10, 10)).toBe(0);
  });
});

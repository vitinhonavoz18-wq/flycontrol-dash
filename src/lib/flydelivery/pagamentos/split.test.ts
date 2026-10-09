import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calcularDivisao,
  centavosParaValorDaApi,
  COMISSAO_MAXIMA,
  COMISSAO_MINIMA,
  formatarCentavos,
  reaisParaCentavos,
  validarComissao,
} from "./split";

describe("divisão do Pix entre plataforma e estabelecimento", () => {
  it("pedido de R$ 100,00 com 3%: R$ 3,00 da plataforma e R$ 97,00 da loja", () => {
    expect(calcularDivisao(10_000, 3)).toEqual({
      totalCentavos: 10_000,
      comissaoPercentual: 3,
      percentualLoja: 97,
      centavosLoja: 9_700,
      centavosPlataforma: 300,
    });
  });

  it("o centavo do arredondamento fica com a plataforma, e as partes sempre fecham o total", () => {
    const d = calcularDivisao(3_333, 3); // 3333 × 97% = 3233,01
    expect(d.centavosLoja).toBe(3_233);
    expect(d.centavosPlataforma).toBe(100);
    for (const total of [1, 99, 101, 1_999, 12_345, 99_999]) {
      for (const comissao of [1, 3, 5, 12, 50]) {
        const x = calcularDivisao(total, comissao);
        expect(x.centavosLoja + x.centavosPlataforma).toBe(total);
        expect(x.centavosLoja).toBeLessThanOrEqual((total * (100 - comissao)) / 100);
      }
    }
  });

  it("percentual inválido para o Pix é recusado, sem arredondar por conta própria", () => {
    expect(validarComissao(2.5)).toMatchObject({ ok: false });
    expect(validarComissao("2,5")).toMatchObject({ ok: false });
    expect(validarComissao(0)).toMatchObject({ ok: false });
    expect(validarComissao(97)).toMatchObject({ ok: false });
    expect(validarComissao("abc")).toMatchObject({ ok: false });
    expect(validarComissao(null)).toMatchObject({ ok: false });
    expect(validarComissao("3")).toEqual({ ok: true, valor: 3 });
    expect(() => calcularDivisao(10_000, 2.5)).toThrow(/inteiro/);
    expect(() => calcularDivisao(0, 3)).toThrow();
    expect(() => calcularDivisao(10.5, 3)).toThrow();
  });

  it("o banco usa a MESMA regra e os MESMOS limites (senão tela e cobrança discordam)", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261009120000_flydelivery_pix_split_syncpay.sql"),
      "utf8",
    );
    expect(sql).toContain("v_store_cents := (v_checkout.total_cents * v_store_percent) / 100;");
    expect(sql).toContain("v_checkout.total_cents - v_store_cents, v_store_cents");
    expect(sql).toContain(`between ${COMISSAO_MINIMA} and ${COMISSAO_MAXIMA}`);
  });
});

describe("reais ↔ centavos sem ponto flutuante", () => {
  it("lê o valor do banco pelo texto, não pela conta", () => {
    expect(reaisParaCentavos(19.9)).toBe(1_990);
    expect(reaisParaCentavos("19.90")).toBe(1_990);
    expect(reaisParaCentavos(0.1 + 0.2)).toBeNull(); // 0.30000000000000004: não é dinheiro
    expect(reaisParaCentavos("100")).toBe(10_000);
    expect(reaisParaCentavos("100.005")).toBeNull();
    expect(reaisParaCentavos("100.500")).toBe(10_050);
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos(null)).toBeNull();
    expect(reaisParaCentavos(undefined)).toBeNull();
  });

  it("manda para a SyncPay o valor em reais", () => {
    expect(centavosParaValorDaApi(10_000)).toBe(100);
    expect(centavosParaValorDaApi(1_990)).toBe(19.9);
    expect(centavosParaValorDaApi(1)).toBe(0.01);
    expect(() => centavosParaValorDaApi(0)).toThrow();
    expect(() => centavosParaValorDaApi(10.5)).toThrow();
  });

  it("formata para a tela", () => {
    expect(formatarCentavos(123_456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(-300)).toBe("- R$ 3,00");
    expect(formatarCentavos(null)).toBe("—");
  });
});

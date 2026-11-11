import { describe, expect, it } from "vitest";
import {
  DIAS_DE_HISTORICO,
  intervaloPersonalizado,
  lerCampoDeData,
  paraCampoDeData,
  pedidoContaComoVenda,
  resumoDosCancelados,
  separarCancelados,
} from "./metricas";

const pedido = (status: string, total: number) => ({ status, total });

describe("pedido cancelado não é venda", () => {
  const doDia = [
    pedido("entregue", 80),
    pedido("cancelado", 120),
    pedido("novo", 40),
    pedido("cancelado", 30),
  ];

  it("só o status 'cancelado' sai da conta", () => {
    for (const status of ["novo", "preparando", "saiu", "entregue"]) {
      expect(pedidoContaComoVenda(status)).toBe(true);
    }
    expect(pedidoContaComoVenda("cancelado")).toBe(false);
  });

  it("separa o que conta do que foi cancelado", () => {
    const { validos, cancelados } = separarCancelados(doDia);
    expect(validos.map((p) => p.total)).toEqual([80, 40]);
    expect(cancelados.map((p) => p.total)).toEqual([120, 30]);
  });

  it("o faturamento do exemplo é 120, e não 270", () => {
    // O caso que motivou a correção: R$ 150 de pedidos cancelados entravam
    // no faturamento e puxavam o ticket médio para cima.
    const { validos, cancelados } = separarCancelados(doDia);
    const faturamento = validos.reduce((s, p) => s + p.total, 0);
    expect(faturamento).toBe(120);
    expect(faturamento / validos.length).toBe(60); // ticket médio
    expect(resumoDosCancelados(cancelados)).toEqual({ quantidade: 2, valor: 150 });
  });

  it("quem filtra por 'Cancelado' vê os cancelados nos números", () => {
    const soCancelados = doDia.filter((p) => p.status === "cancelado");
    const { validos, cancelados } = separarCancelados(soCancelados, "cancelado");
    expect(validos).toHaveLength(2);
    expect(cancelados).toHaveLength(0);
  });

  it("período sem cancelamento não inventa nada", () => {
    const { validos, cancelados } = separarCancelados([pedido("entregue", 10)]);
    expect(validos).toHaveLength(1);
    expect(resumoDosCancelados(cancelados)).toEqual({ quantidade: 0, valor: 0 });
  });

  it("valor quebrado ou ausente não vira 'NaN' na tela", () => {
    expect(
      resumoDosCancelados([{ total: 10 }, { total: Number.NaN }, { total: undefined as never }]),
    ).toEqual({ quantidade: 3, valor: 10 });
  });
});

describe("campo de data", () => {
  it("lê a data como meia-noite do aparelho, e não de Londres", () => {
    const data = lerCampoDeData("2026-11-11");
    expect(data?.getFullYear()).toBe(2026);
    expect(data?.getMonth()).toBe(10);
    expect(data?.getDate()).toBe(11);
    expect(data?.getHours()).toBe(0);
  });

  it("ida e volta dão a mesma data", () => {
    expect(paraCampoDeData(lerCampoDeData("2026-03-05") as Date)).toBe("2026-03-05");
  });

  it("recusa o que não é data", () => {
    for (const ruim of ["", "11/11/2026", "2026-13-01", "2026-02-31", "ontem"]) {
      expect(lerCampoDeData(ruim), ruim).toBeNull();
    }
  });
});

describe("período personalizado", () => {
  const hoje = new Date(2026, 10, 11, 15, 30); // 11/nov/2026, 15h30

  it("vai do começo do primeiro dia ao fim do último", () => {
    const r = intervaloPersonalizado("2026-11-01", "2026-11-10", hoje);
    expect(r?.start).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
    expect(r?.end).toEqual(new Date(2026, 10, 10, 23, 59, 59, 999));
  });

  it("um dia só também vale", () => {
    const r = intervaloPersonalizado("2026-11-05", "2026-11-05", hoje);
    expect(r?.start.getDate()).toBe(5);
    expect(r?.end.getDate()).toBe(5);
    expect(r?.end.getHours()).toBe(23);
  });

  it("datas trocadas são destrocadas", () => {
    const r = intervaloPersonalizado("2026-11-10", "2026-11-01", hoje);
    expect(r?.start.getDate()).toBe(1);
    expect(r?.end.getDate()).toBe(10);
  });

  it("não deixa escolher o futuro", () => {
    const r = intervaloPersonalizado("2026-11-01", "2026-12-25", hoje);
    expect(r?.end).toEqual(new Date(2026, 10, 11, 23, 59, 59, 999));
  });

  it("não deixa pedir além do histórico carregado", () => {
    const r = intervaloPersonalizado("2025-01-01", "2026-11-11", hoje);
    const limite = new Date(2026, 10, 11);
    limite.setDate(limite.getDate() - DIAS_DE_HISTORICO);
    expect(r?.start).toEqual(limite);
  });

  it("data inválida devolve nulo em vez de um intervalo errado", () => {
    expect(intervaloPersonalizado("", "2026-11-10", hoje)).toBeNull();
    expect(intervaloPersonalizado("2026-11-01", "bobagem", hoje)).toBeNull();
  });
});

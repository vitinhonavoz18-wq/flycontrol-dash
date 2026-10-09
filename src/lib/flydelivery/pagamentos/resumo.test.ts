import { describe, expect, it } from "vitest";
import {
  liquidoPrevistoDaLoja,
  paraCsv,
  resumirPagamentos,
  resumirPorLoja,
  type LinhaDePagamento,
} from "./resumo";

const base = (p: Partial<LinhaDePagamento>): LinhaDePagamento => ({
  id: "p",
  store_id: "loja-a",
  status: "pago",
  created_at: "2026-10-09T12:00:00Z",
  amount_cents: 10_000,
  fee_percent: 3,
  platform_amount_cents: 300,
  store_amount_cents: 9_700,
  gateway_fee_cents: null,
  needs_reconciliation: false,
  ...p,
});

describe("resumo financeiro do Pix", () => {
  it("separa confirmadas, pendentes, erros e estornos — e só soma comissão do que foi pago", () => {
    const r = resumirPagamentos([
      base({}),
      base({ amount_cents: 5_000, platform_amount_cents: 150, store_amount_cents: 4_850 }),
      base({ status: "pendente" }),
      base({ status: "incerto", needs_reconciliation: true }),
      base({ status: "falhou" }),
      base({ status: "estornado", needs_reconciliation: true }),
      base({ status: "expirado" }),
    ]);
    expect(r.confirmadas).toEqual({ quantidade: 2, centavos: 15_000 });
    expect(r.comissaoPlataforma).toBe(450);
    expect(r.repasseBrutoLoja).toBe(14_550);
    expect(r.pendentes).toEqual({ quantidade: 2, centavos: 20_000 });
    expect(r.comErro.quantidade).toBe(1);
    expect(r.estornosEAjustes).toEqual({ quantidade: 1, centavos: 10_000 });
    expect(r.pendenciasDeConciliacao).toBe(2);
    expect(r.tarifasInformadas).toBeNull();
  });

  it("líquido da loja só vira número quando dá para saber a tarifa", () => {
    const semTarifa = resumirPagamentos([base({})]);
    expect(liquidoPrevistoDaLoja(semTarifa, "nao_definido")).toBeNull();
    expect(liquidoPrevistoDaLoja(semTarifa, "estabelecimento")).toBeNull();
    expect(liquidoPrevistoDaLoja(semTarifa, "plataforma")).toBe(9_700);

    const comTarifa = resumirPagamentos([base({ gateway_fee_cents: 99 })]);
    expect(liquidoPrevistoDaLoja(comTarifa, "estabelecimento")).toBe(9_601);
    expect(liquidoPrevistoDaLoja(comTarifa, "proporcional")).toBeNull();
  });

  it("agrupa por loja para a conciliação do administrador", () => {
    const porLoja = resumirPorLoja([
      base({ store_id: "a", store_name: "Pizzaria A" }),
      base({
        store_id: "b",
        store_name: "Lanches B",
        amount_cents: 20_000,
        platform_amount_cents: 1000,
        store_amount_cents: 19_000,
      }),
      base({ store_id: "a", store_name: "Pizzaria A", status: "pendente" }),
    ]);
    expect(porLoja.map((l) => l.loja)).toEqual(["Lanches B", "Pizzaria A"]);
    expect(porLoja[1].resumo.pendentes.quantidade).toBe(1);
  });
});

describe("exportação para planilha", () => {
  it("usa ; e vírgula decimal, e neutraliza fórmula escondida em nome de loja", () => {
    const csv = paraCsv([
      base({
        store_name: '=HYPERLINK("http://golpe")',
        order_number: 12,
        amount_cents: 123_456,
        platform_amount_cents: 3_704,
        store_amount_cents: 119_752,
      }),
    ]);
    const [cabecalho, linha] = csv.split("\r\n");
    expect(cabecalho.split(";")).toHaveLength(11);
    expect(linha).toContain(";1234,56;3;37,04;1197,52;");
    expect(linha).toContain(`"'=HYPERLINK(""http://golpe"")"`);
    expect(linha).toContain(";Pago;");
  });
});

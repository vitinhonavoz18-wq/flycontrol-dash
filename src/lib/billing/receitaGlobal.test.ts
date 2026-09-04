import { describe, expect, it } from "vitest";
import { somarReceitaGlobal, receitaDoCicloCents, type CicloParaSomaGlobal } from "./receitaGlobal";
import { consumoDoCicloCents } from "./billingEngine";

/**
 * O total que a FlyControl fatura com a cobrança por pedido.
 *
 * O DEFEITO QUE ISSO EVITA
 *
 * A conta errada — e a mais tentadora — é "total de pedidos × uma tarifa só".
 * Ela quebra em dois lugares ao mesmo tempo: lojas diferentes podem estar em
 * faixas diferentes, e dentro da MESMA loja o preço muda conforme os pedidos
 * entram. Tirar média das tarifas também não vale: média não é dinheiro.
 */

function ciclo(over: Partial<CicloParaSomaGlobal> = {}): CicloParaSomaGlobal {
  return {
    companyId: "loja-1",
    companyName: "Loja 1",
    status: "open",
    usageBased: true,
    centsPolicy: "cents_v2",
    unitPriceCents: 70,
    billableOrderCount: 0,
    grossUsageAmountCents: null,
    ...over,
  };
}

describe("receita global da cobrança por pedido", () => {
  it("Cenário 1: duas lojas em faixas diferentes somam o valor exato", () => {
    // Açaí: 2 pedidos na primeira faixa = 2 × R$ 0,70 = R$ 1,40
    // Hamburgueria: já passou dos 100, então os 2 dela custam R$ 0,60 cada.
    // Para reproduzir isso com honestidade, a hamburgueria tem 102 pedidos:
    // 100 × 0,70 + 2 × 0,60 = 7000 + 120.
    const r = somarReceitaGlobal([
      ciclo({ companyId: "acai", companyName: "Açaí", billableOrderCount: 2 }),
      ciclo({ companyId: "burger", companyName: "Hamburgueria", billableOrderCount: 102 }),
    ]);
    expect(r.totalCents).toBe(140 + 7000 + 120);
    expect(r.lojas).toHaveLength(2);
  });

  it("duas lojas pequenas em faixas diferentes: R$ 1,40 + R$ 1,20 = R$ 2,60", () => {
    // A loja B está num ciclo da regra ANTIGA, com preço congelado de R$ 0,60.
    // É o caso literal do exemplo: tarifas diferentes ao mesmo tempo.
    const r = somarReceitaGlobal([
      ciclo({ companyId: "a", billableOrderCount: 2 }),
      ciclo({ companyId: "b", centsPolicy: null, unitPriceCents: 60, billableOrderCount: 2 }),
    ]);
    expect(r.totalCents).toBe(260);
  });

  it("Cenário 2: quatro lojas, uma em cada faixa", () => {
    // Cada loja com preço congelado diferente (regra antiga), 10 pedidos cada.
    const r = somarReceitaGlobal(
      [70, 60, 50, 40].map((preco, i) =>
        ciclo({
          companyId: `loja-${i}`,
          centsPolicy: null,
          unitPriceCents: preco,
          billableOrderCount: 10,
        }),
      ),
    );
    expect(r.totalCents).toBe(700 + 600 + 500 + 400); // R$ 22,00
  });

  it("Cenário 3: um pedido novo entra e o total sobe pelo preço da faixa dele", () => {
    const antes = somarReceitaGlobal([ciclo({ billableOrderCount: 120 })]).totalCents;
    const depois = somarReceitaGlobal([ciclo({ billableOrderCount: 121 })]).totalCents;
    // O 121º pedido está na segunda faixa: sobe exatamente 60 centavos.
    expect(depois - antes).toBe(60);
  });

  it("Cenário 5: ciclo fechado guarda o valor que cobrou e não é recalculado", () => {
    // A loja fechou o mês com 100 pedidos a R$ 0,70 = R$ 70,00. Depois mudou
    // de faixa. O mês passado continua valendo R$ 70,00.
    const fechado = ciclo({
      status: "closed",
      billableOrderCount: 100,
      grossUsageAmountCents: 7000,
      unitPriceCents: 40,
      centsPolicy: "cents_v2",
    });
    expect(receitaDoCicloCents(fechado)).toBe(7000);
  });

  it("nunca usa uma tarifa única: 600 pedidos não custam 600 × R$ 0,40", () => {
    const total = receitaDoCicloCents(ciclo({ billableOrderCount: 600 }));
    expect(total).not.toBe(600 * 40);
    // 100×70 + 150×60 + 250×50 + 100×40 = 7000 + 9000 + 12500 + 4000
    expect(total).toBe(32500);
  });

  it("nunca usa média de tarifa", () => {
    // Média entre 0,70 e 0,60 daria 0,65 × 4 = 260 por acaso; o teste real é
    // com quantidades diferentes, onde a média erra.
    const r = somarReceitaGlobal([
      ciclo({ companyId: "a", centsPolicy: null, unitPriceCents: 70, billableOrderCount: 10 }),
      ciclo({ companyId: "b", centsPolicy: null, unitPriceCents: 40, billableOrderCount: 1 }),
    ]);
    const media = Math.round(((70 + 40) / 2) * 11);
    expect(r.totalCents).toBe(700 + 40);
    expect(r.totalCents).not.toBe(media);
  });

  it("plano mensal fixo não entra na conta de cobrança por pedido", () => {
    const r = somarReceitaGlobal([
      ciclo({ companyId: "premium", usageBased: false, billableOrderCount: 900 }),
      ciclo({ companyId: "cents", billableOrderCount: 10 }),
    ]);
    expect(r.totalCents).toBe(700);
    expect(r.lojas).toHaveLength(1);
  });

  it("a mesma loja com vários ciclos soma os ciclos, e não duplica a loja", () => {
    const r = somarReceitaGlobal([
      ciclo({ status: "closed", billableOrderCount: 10, grossUsageAmountCents: 700 }),
      ciclo({ billableOrderCount: 10 }),
    ]);
    expect(r.totalCents).toBe(1400);
    expect(r.lojas).toHaveLength(1);
    expect(r.lojas[0].pedidos).toBe(20);
    expect(r.ciclosAbertos).toBe(1);
    expect(r.ciclosFechados).toBe(1);
  });

  it("tudo em centavos inteiros — nunca R$ 2,599999", () => {
    const r = somarReceitaGlobal([
      ciclo({ companyId: "a", billableOrderCount: 2 }),
      ciclo({ companyId: "b", centsPolicy: null, unitPriceCents: 60, billableOrderCount: 2 }),
    ]);
    expect(Number.isInteger(r.totalCents)).toBe(true);
  });

  it("é exatamente a mesma conta que a fatura da loja usa", () => {
    // Se um dia alguém escrever uma segunda conta para o painel global, este
    // teste quebra. É a trava contra "a loja vê R$ 0,60 e o painel soma 0,70".
    const pedidos = 187;
    const daFatura = consumoDoCicloCents({
      usageBased: true,
      unitPriceCents: 70,
      billableOrderCount: pedidos,
      centsPolicy: "cents_v2",
    });
    const doPainel = receitaDoCicloCents(ciclo({ billableOrderCount: pedidos }));
    expect(doPainel).toBe(daFatura);
  });

  it("valores estranhos vindos do banco não viram NaN", () => {
    const r = somarReceitaGlobal([
      ciclo({ billableOrderCount: Number.NaN as unknown as number }),
      ciclo({ companyId: "b", status: "closed", grossUsageAmountCents: null }),
    ]);
    expect(r.totalCents).toBe(0);
  });
});

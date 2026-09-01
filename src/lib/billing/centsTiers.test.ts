import { describe, expect, it } from "vitest";
import {
  POLITICA_CENTS_V1,
  POLITICA_CENTS_V2,
  custoTotalCents,
  distribuirPorFaixa,
  faixaAtual,
  faixaDoPedido,
  marcosDaTrilha,
  politicaPorVersao,
  posicaoNaTrilha,
  progressoCents,
  POLITICA_CENTS_VIGENTE,
  proximaMeta,
} from "./centsTiers";
import { formatCents } from "./money";
import { buildInvoiceItems, calculateCycle } from "./billingEngine";

const P = POLITICA_CENTS_V2;

describe("fronteiras — nenhum pedido fica de fora nem conta duas vezes", () => {
  it("cada pedido cai em exatamente uma faixa", () => {
    // A varredura que prova a regra: do pedido 1 ao 1200, um por um, sem
    // buraco e sem sobreposição.
    for (let n = 1; n <= 1200; n++) {
      const faixas = P.faixas.filter((f) => n >= f.de && (f.ate === null || n <= f.ate));
      expect(faixas.length, `pedido ${n}`).toBe(1);
    }
  });

  it("as faixas se encostam sem deixar vão", () => {
    for (let i = 1; i < P.faixas.length; i++) {
      expect(P.faixas[i].de).toBe((P.faixas[i - 1].ate ?? 0) + 1);
    }
  });

  it("os pedidos exatamente na virada estão no lugar certo", () => {
    const esperado: Array<[number, number]> = [
      [1, 70],
      [100, 70],
      [101, 60],
      [250, 60],
      [251, 50],
      [500, 50],
      [501, 40],
      [999, 40],
    ];
    for (const [n, preco] of esperado) {
      expect(faixaDoPedido(P, n).precoCents, `pedido ${n}`).toBe(preco);
    }
  });

  it("recusa número de pedido inválido em vez de chutar uma faixa", () => {
    for (const n of [0, -1, 1.5, NaN]) {
      expect(() => faixaDoPedido(P, n)).toThrow();
    }
  });
});

describe("a conta é progressiva — o desconto vale dali para frente", () => {
  it("600 pedidos NÃO são 600 x R$ 0,40", () => {
    // A regra mais importante do plano. Se algum dia isto quebrar, o
    // faturamento despenca sem ninguém perceber.
    const errado = 600 * 40;
    expect(custoTotalCents(P, 600)).not.toBe(errado);

    // 100x0,70 + 150x0,60 + 250x0,50 + 100x0,40
    const certo = 100 * 70 + 150 * 60 + 250 * 50 + 100 * 40;
    expect(custoTotalCents(P, 600)).toBe(certo);
    expect(formatCents(custoTotalCents(P, 600))).toBe("R$ 325,00");
  });

  it("o exemplo de 187 pedidos bate com o que a tela promete", () => {
    // 100 na faixa de R$ 0,70 e 87 na de R$ 0,60 — exatamente o que aparece
    // em "ver detalhes da cobrança".
    const pedacos = distribuirPorFaixa(P, 187);
    expect(pedacos.map((p) => [p.faixa.precoCents, p.quantidade])).toEqual([
      [70, 100],
      [60, 87],
    ]);
    expect(custoTotalCents(P, 187)).toBe(100 * 70 + 87 * 60);
  });

  it("cada pedaço soma certo e o total fecha", () => {
    for (const total of [0, 1, 99, 100, 101, 249, 250, 251, 499, 500, 501, 1000, 5000]) {
      const pedacos = distribuirPorFaixa(P, total);
      const somaDasQuantidades = pedacos.reduce((s, p) => s + p.quantidade, 0);
      expect(somaDasQuantidades, `total ${total}`).toBe(total);

      const somaDosSubtotais = pedacos.reduce((s, p) => s + p.subtotalCents, 0);
      expect(somaDosSubtotais, `total ${total}`).toBe(custoTotalCents(P, total));
    }
  });

  it("um pedido a mais nunca deixa a conta mais barata", () => {
    // Sanidade da regra: se em algum ponto a conta caísse ao vender mais, o
    // preço progressivo estaria invertido.
    let anterior = 0;
    for (let n = 0; n <= 1200; n++) {
      const atual = custoTotalCents(P, n);
      expect(atual, `pedido ${n}`).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });

  it("o preço de cada pedido novo bate com a diferença do total", () => {
    // A prova cruzada: o que a tela promete cobrar pelo próximo pedido tem de
    // ser exatamente o que a conta cresce quando ele entra.
    for (const n of [0, 50, 99, 100, 101, 200, 249, 250, 251, 400, 499, 500, 501, 900]) {
      const promessa = faixaAtual(P, n).precoCents;
      const diferenca = custoTotalCents(P, n + 1) - custoTotalCents(P, n);
      expect(diferenca, `depois de ${n} pedidos`).toBe(promessa);
    }
  });

  it("zero pedido custa zero e não gera linha de fatura", () => {
    expect(custoTotalCents(P, 0)).toBe(0);
    expect(distribuirPorFaixa(P, 0)).toEqual([]);
  });

  it("recusa quantidade inválida", () => {
    for (const v of [-1, 1.5, NaN]) {
      expect(() => custoTotalCents(P, v)).toThrow();
    }
  });
});

describe("o preço que vale agora", () => {
  it("completar a meta já barateia o próximo pedido", () => {
    // Com 100 feitos, o próximo é o 101 — é essa a conquista.
    expect(faixaAtual(P, 99).precoCents).toBe(70);
    expect(faixaAtual(P, 100).precoCents).toBe(60);
    expect(faixaAtual(P, 250).precoCents).toBe(50);
    expect(faixaAtual(P, 500).precoCents).toBe(40);
  });

  it("no começo do ciclo o preço é o cheio", () => {
    expect(faixaAtual(P, 0).precoCents).toBe(70);
    expect(faixaAtual(P, 0).nivel).toBe(1);
  });
});

describe("próxima meta", () => {
  it("em 187 pedidos faltam 63 para a meta de 250", () => {
    const m = proximaMeta(P, 187);
    expect(m).toEqual({
      meta: 250,
      faltam: 63,
      faixaSeguinte: expect.objectContaining({ nivel: 3, precoCents: 50 }),
    });
  });

  it("as metas são sempre 100, 250 e 500", () => {
    expect(proximaMeta(P, 0)?.meta).toBe(100);
    expect(proximaMeta(P, 100)?.meta).toBe(250);
    expect(proximaMeta(P, 250)?.meta).toBe(500);
  });

  it("faltam = meta menos pedidos, sempre", () => {
    for (const n of [0, 1, 50, 99, 100, 101, 187, 249, 250, 400, 499]) {
      const m = proximaMeta(P, n);
      if (m) expect(m.faltam, `em ${n}`).toBe(m.meta - n);
    }
  });

  it("no último nível não existe próxima meta", () => {
    expect(proximaMeta(P, 500)).toBeNull();
    expect(proximaMeta(P, 501)).toBeNull();
    expect(proximaMeta(P, 5000)).toBeNull();
  });
});

describe("trilha visual", () => {
  it("cada fase ocupa uma fatia igual da barra", () => {
    // Numa régua proporcional a primeira fase viraria um tracinho, e quem
    // está começando não veria progresso nenhum.
    expect(posicaoNaTrilha(P, 0)).toBe(0);
    expect(posicaoNaTrilha(P, 50)).toBeCloseTo(100 / 3 / 2, 1);
    expect(posicaoNaTrilha(P, 100)).toBeCloseTo(100 / 3, 1);
    expect(posicaoNaTrilha(P, 250)).toBeCloseTo((100 / 3) * 2, 1);
    expect(posicaoNaTrilha(P, 500)).toBe(100);
  });

  it("acima do máximo o marcador para no fim da barra", () => {
    // O contador continua subindo; a barra não passa de 100%.
    for (const n of [501, 700, 1000, 2000, 99999]) {
      expect(posicaoNaTrilha(P, n), `${n} pedidos`).toBe(100);
    }
  });

  it("a posição nunca anda para trás", () => {
    let anterior = -1;
    for (let n = 0; n <= 700; n++) {
      const p = posicaoNaTrilha(P, n);
      expect(p, `${n}`).toBeGreaterThanOrEqual(anterior);
      anterior = p;
    }
  });

  it("os marcos mudam de estado conforme a loja avança", () => {
    const em187 = marcosDaTrilha(P, 187);
    expect(em187.map((m) => [m.meta, m.estado])).toEqual([
      [100, "concluido"],
      [250, "atual"],
      [500, "bloqueado"],
    ]);

    const em0 = marcosDaTrilha(P, 0);
    expect(em0.map((m) => m.estado)).toEqual(["atual", "bloqueado", "bloqueado"]);

    const noMaximo = marcosDaTrilha(P, 600);
    expect(noMaximo.map((m) => m.estado)).toEqual(["concluido", "concluido", "concluido"]);
  });

  it("cada marco diz qual preço desbloqueia", () => {
    expect(marcosDaTrilha(P, 0).map((m) => [m.meta, m.precoCents])).toEqual([
      [100, 60],
      [250, 50],
      [500, 40],
    ]);
  });
});

describe("progresso completo (o que a tela recebe pronto)", () => {
  it("monta o cartão dos 187 pedidos exatamente como o painel promete", () => {
    const p = progressoCents(P, 187);
    expect(p.pedidos).toBe(187);
    expect(p.faixaAtual.nivel).toBe(2);
    expect(p.precoDoProximoPedidoCents).toBe(60);
    expect(p.proxima?.faltam).toBe(63);
    expect(p.proxima?.faixaSeguinte.precoCents).toBe(50);
    expect(p.noMaximo).toBe(false);
    expect(formatCents(p.totalCents)).toBe("R$ 122,20");
  });

  it("o percentual da fase é o progresso dentro dela, não do ciclo", () => {
    // 187 na fase que vai de 101 a 250: (187-100) / (250-100) = 58%.
    expect(progressoCents(P, 187).percentDaFase).toBe(58);
    expect(progressoCents(P, 100).percentDaFase).toBe(0);
    expect(progressoCents(P, 0).percentDaFase).toBe(0);
    expect(progressoCents(P, 50).percentDaFase).toBe(50);
  });

  it("no CENTS MAX a fase fica cheia e o contador continua real", () => {
    const p = progressoCents(P, 1240);
    expect(p.noMaximo).toBe(true);
    expect(p.percentDaFase).toBe(100);
    expect(p.posicaoNaTrilha).toBe(100);
    expect(p.pedidos).toBe(1240);
    expect(p.precoDoProximoPedidoCents).toBe(40);
  });

  it("o total do progresso é o mesmo da conta oficial", () => {
    for (const n of [0, 1, 100, 187, 250, 501, 1240]) {
      expect(progressoCents(P, n).totalCents, `${n}`).toBe(custoTotalCents(P, n));
    }
  });
});

describe("versões da política", () => {
  it("a política antiga cobra um preço só, do jeito que sempre cobrou", () => {
    expect(custoTotalCents(POLITICA_CENTS_V1, 600)).toBe(600 * 70);
    expect(proximaMeta(POLITICA_CENTS_V1, 100)).toBeNull();
  });

  it("recupera a política pelo nome gravado no ciclo", () => {
    expect(politicaPorVersao("cents_v2").versao).toBe("cents_v2");
    expect(politicaPorVersao("cents_v1").versao).toBe("cents_v1");
  });

  it("versão desconhecida cai na antiga, que é a mais conservadora", () => {
    // Na dúvida cobra-se o preço cheio: inventar um desconto que ninguém
    // contratou é pior do que cobrar a mais e ter de devolver.
    for (const v of [null, undefined, "", "cents_v9", 42]) {
      expect(politicaPorVersao(v).versao).toBe("cents_v1");
    }
  });

  it("mudar o preço no futuro não pode reescrever fatura antiga", () => {
    // O ciclo guarda a versão. Enquanto a V1 existir com estes números, uma
    // fatura fechada nela continua valendo o que valia.
    expect(POLITICA_CENTS_V1.faixas[0].precoCents).toBe(70);
    expect(POLITICA_CENTS_V2.faixas.map((f) => f.precoCents)).toEqual([70, 60, 50, 40]);
  });
});

describe("cada ciclo carrega a sua própria tabela de preço", () => {
  it("o ciclo é lido pelo CARIMBO dele, não pela tabela de hoje", () => {
    // Este é o coração da mudança. Antes, a tabela era decidida na hora de
    // fechar a conta, olhando uma configuração do servidor — e mexer nessa
    // configuração mudava o preço de meses já vendidos. Agora o ciclo guarda
    // a versão dele e o fechamento obedece ao que está escrito na linha.
    expect(politicaPorVersao("cents_v1").versao).toBe("cents_v1");
    expect(politicaPorVersao("cents_v2").versao).toBe("cents_v2");
  });

  it("carimbo ausente ou desconhecido cai na tabela antiga", () => {
    // Na dúvida, preço cheio. Inventar um desconto que ninguém contratou é
    // pior do que cobrar o de sempre.
    for (const v of [null, undefined, "", "cents_v9", 7, {}]) {
      expect(politicaPorVersao(v).versao).toBe("cents_v1");
    }
  });

  it("os ciclos novos nascem com as faixas progressivas", () => {
    // Se alguém trocar a política vigente sem querer, este teste avisa.
    expect(POLITICA_CENTS_VIGENTE.versao).toBe("cents_v2");
    expect(POLITICA_CENTS_VIGENTE.faixas.map((f) => f.precoCents)).toEqual([70, 60, 50, 40]);
  });

  it("mudar a política vigente não mexe em ciclo já aberto", () => {
    // Um ciclo carimbado como v1 continua v1 mesmo com a vigente sendo v2 —
    // é o que impede mudar o combinado com o cliente no meio do mês.
    const cicloAntigo = { cents_policy: "cents_v1" };
    expect(politicaPorVersao(cicloAntigo.cents_policy).versao).toBe("cents_v1");
    expect(POLITICA_CENTS_VIGENTE.versao).not.toBe(cicloAntigo.cents_policy);
  });
});

describe("a fatura sai discriminada por faixa", () => {
  it("uma linha por faixa usada, com o preço de cada uma", () => {
    // Uma linha só, com preço médio, faria o cliente conferir a conta e não
    // conseguir refazê-la — é o tipo de fatura que gera ligação no suporte.
    const totals = calculateCycle({
      planCode: "cents",
      unitPriceCents: 70,
      promotionThresholdOrders: 0,
      billableOrderCount: 600,
      setupFeeAlreadyCharged: true,
      centsPolicy: "cents_v2",
    });

    const itens = buildInvoiceItems("cents", totals);
    expect(itens.map((i) => [i.quantity, i.unitAmountCents, i.totalAmountCents])).toEqual([
      [100, 70, 7000],
      [150, 60, 9000],
      [250, 50, 12500],
      [100, 40, 4000],
    ]);

    const soma = itens.reduce((s, i) => s + i.totalAmountCents, 0);
    expect(soma).toBe(totals.usageAmountCents);
    expect(formatCents(soma)).toBe("R$ 325,00");
  });

  it("sem a política nova, a fatura sai como sempre saiu", () => {
    const totals = calculateCycle({
      planCode: "cents",
      unitPriceCents: 70,
      promotionThresholdOrders: 500,
      billableOrderCount: 600,
      setupFeeAlreadyCharged: true,
    });
    const itens = buildInvoiceItems("cents", totals);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ quantity: 600, unitAmountCents: 70 });
    expect(totals.usageAmountCents).toBe(600 * 70);
  });

  it("o motor de cobrança e a tela chegam ao mesmo número", () => {
    // A prova que impede a tela prometer um valor e a fatura cobrar outro.
    for (const n of [0, 1, 100, 187, 250, 500, 600, 1240]) {
      const totals = calculateCycle({
        planCode: "cents",
        unitPriceCents: 70,
        promotionThresholdOrders: 0,
        billableOrderCount: n,
        setupFeeAlreadyCharged: true,
        centsPolicy: "cents_v2",
      });
      expect(totals.usageAmountCents, `${n} pedidos`).toBe(progressoCents(P, n).totalCents);
    }
  });
});

// ---------------------------------------------------------------------------
// A tabela financeira, número por número (item 46 do pedido)
// ---------------------------------------------------------------------------

/**
 * A tabela que qualquer pessoa pode conferir na mão.
 *
 * Cada linha é uma quantidade de pedidos no mês e tudo o que o sistema tem de
 * dizer sobre ela: em que nível a loja está, quanto vai custar o PRÓXIMO
 * pedido, qual é a próxima meta, quantos pedidos faltam e quanto já é a
 * conta acumulada. As viradas (99/100/101, 249/250/251, 499/500/501) estão
 * todas aqui de propósito: é onde erro de um pedido para mais ou para menos
 * costuma se esconder.
 *
 * Se algum dia o preço mudar, esta tabela é o primeiro lugar a conferir.
 */
const TABELA: Array<{
  pedidos: number;
  nivel: number;
  proximoPedidoCents: number;
  meta: number | null;
  faltam: number | null;
  totalCents: number;
}> = [
  { pedidos: 0, nivel: 1, proximoPedidoCents: 70, meta: 100, faltam: 100, totalCents: 0 },
  { pedidos: 1, nivel: 1, proximoPedidoCents: 70, meta: 100, faltam: 99, totalCents: 70 },
  { pedidos: 99, nivel: 1, proximoPedidoCents: 70, meta: 100, faltam: 1, totalCents: 6930 },
  // Bateu 100: o desconto já vale para o pedido 101 em diante.
  { pedidos: 100, nivel: 2, proximoPedidoCents: 60, meta: 250, faltam: 150, totalCents: 7000 },
  { pedidos: 101, nivel: 2, proximoPedidoCents: 60, meta: 250, faltam: 149, totalCents: 7060 },
  { pedidos: 249, nivel: 2, proximoPedidoCents: 60, meta: 250, faltam: 1, totalCents: 15940 },
  { pedidos: 250, nivel: 3, proximoPedidoCents: 50, meta: 500, faltam: 250, totalCents: 16000 },
  { pedidos: 251, nivel: 3, proximoPedidoCents: 50, meta: 500, faltam: 249, totalCents: 16050 },
  { pedidos: 499, nivel: 3, proximoPedidoCents: 50, meta: 500, faltam: 1, totalCents: 28450 },
  // Bateu 500: CENTS MAX. Não existe meta seguinte.
  { pedidos: 500, nivel: 4, proximoPedidoCents: 40, meta: null, faltam: null, totalCents: 28500 },
  { pedidos: 501, nivel: 4, proximoPedidoCents: 40, meta: null, faltam: null, totalCents: 28540 },
  { pedidos: 1000, nivel: 4, proximoPedidoCents: 40, meta: null, faltam: null, totalCents: 48500 },
];

describe("tabela financeira conferível na mão", () => {
  it.each(TABELA)(
    "$pedidos pedidos: nível $nivel, próximo pedido a $proximoPedidoCents centavos",
    ({ pedidos, nivel, proximoPedidoCents, meta, faltam, totalCents }) => {
      const p = progressoCents(P, pedidos);

      expect(p.pedidos).toBe(pedidos);
      expect(p.faixaAtual.nivel).toBe(nivel);
      expect(p.precoDoProximoPedidoCents).toBe(proximoPedidoCents);
      expect(p.totalCents).toBe(totalCents);
      expect(p.noMaximo).toBe(nivel === 4);

      if (meta === null) {
        expect(p.proxima).toBeNull();
      } else {
        expect(p.proxima?.meta).toBe(meta);
        expect(p.proxima?.faltam).toBe(faltam);
      }
    },
  );

  it.each(TABELA)(
    "$pedidos pedidos: a soma das faixas fecha o total",
    ({ pedidos, totalCents }) => {
      const pedacos = distribuirPorFaixa(P, pedidos);
      expect(pedacos.reduce((s, x) => s + x.subtotalCents, 0)).toBe(totalCents);
      // Nenhum pedido some no meio do caminho.
      expect(pedacos.reduce((s, x) => s + x.quantidade, 0)).toBe(pedidos);
    },
  );

  it("a tabela é conferível a mão, pedido a pedido, do 0 ao 1000", () => {
    // A prova mais simples de todas: somar o preço de cada pedido, um por um,
    // tem de dar exatamente o mesmo que a conta por faixas.
    let soma = 0;
    for (let n = 1; n <= 1000; n++) {
      soma += faixaDoPedido(P, n).precoCents;
      expect(custoTotalCents(P, n), `${n} pedidos`).toBe(soma);
    }
    expect(soma).toBe(48500);
  });
});

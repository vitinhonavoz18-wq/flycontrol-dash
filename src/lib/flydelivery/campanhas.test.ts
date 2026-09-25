import { describe, expect, it } from "vitest";
import {
  centavosDeTexto,
  contaNoLimite,
  dataLonga,
  diasRestantesTexto,
  mensagemDoContrato,
  motivoParaNaoContratar,
  motivoParaNaoImpulsionar,
  novaChaveDeContratacao,
  quandoEntraNaFatura,
  reaisDeCentavos,
  rotuloDoStatus,
  rotuloFinanceiro,
  taxaDeCliques,
  terminoDoImpulso,
  textoDeCentavos,
} from "./campanhas";

const ok = {
  active: true,
  available: true,
  name: "X-Bacon",
  image_url: "https://x/y.jpg",
  price: 29.9,
};

describe("motivoParaNaoImpulsionar", () => {
  it("produto completo pode", () => {
    expect(motivoParaNaoImpulsionar(ok, true)).toBeNull();
  });
  it("sem imagem explica o que fazer", () => {
    expect(motivoParaNaoImpulsionar({ ...ok, image_url: "" }, true)).toBe(
      "Adicione uma imagem para impulsionar este produto.",
    );
  });
  it("indisponível, desativado e sem preço", () => {
    expect(motivoParaNaoImpulsionar({ ...ok, available: false }, true)).toMatch(/indisponível/);
    expect(motivoParaNaoImpulsionar({ ...ok, active: false }, true)).toMatch(/desativado/);
    expect(motivoParaNaoImpulsionar({ ...ok, price: 0 }, true)).toMatch(/preço/);
  });
  it("loja fora do FlyDelivery vem primeiro", () => {
    expect(motivoParaNaoImpulsionar({ ...ok, image_url: "" }, false)).toMatch(/Presença/);
  });
});

describe("taxaDeCliques", () => {
  it("cliques ÷ impressões × 100", () => {
    expect(taxaDeCliques(200, 7)).toBe("3,5%");
    expect(taxaDeCliques(3, 1)).toBe("33,3%");
  });
  it("sem impressão não há taxa", () => {
    expect(taxaDeCliques(0, 0)).toBe("—");
  });
});

describe("status", () => {
  it("rótulos em português", () => {
    expect(rotuloDoStatus("scheduled")).toBe("Programado");
    expect(rotuloDoStatus("finished")).toBe("Finalizado");
    expect(rotuloDoStatus("pending")).toBe("Aguardando aprovação");
  });
  it("só campanha viva conta no limite de 3", () => {
    expect(contaNoLimite("active")).toBe(true);
    expect(contaNoLimite("pending")).toBe(true);
    expect(contaNoLimite("finished")).toBe(false);
    expect(contaNoLimite("cancelled")).toBe(false);
  });
});

describe("reaisDeCentavos", () => {
  it("formata centavos", () => {
    expect(reaisDeCentavos(0)).toMatch(/0,00/);
    expect(reaisDeCentavos(2990)).toMatch(/29,90/);
  });
});

describe("pacotes em centavos (nunca casas decimais)", () => {
  it("os pacotes iniciais", () => {
    expect(centavosDeTexto("10")).toBe(1000);
    expect(centavosDeTexto("25,00")).toBe(2500);
    expect(centavosDeTexto("R$ 60")).toBe(6000);
    expect(centavosDeTexto("105")).toBe(10500);
    expect(centavosDeTexto("245,00")).toBe(24500);
  });
  it("milhar, um dígito de centavo e zero", () => {
    expect(centavosDeTexto("1.234,56")).toBe(123456);
    expect(centavosDeTexto("0,1")).toBe(10);
    expect(centavosDeTexto("0")).toBe(0);
  });
  it("recusa o que é ambíguo ou inválido", () => {
    expect(centavosDeTexto("")).toBeNull();
    expect(centavosDeTexto("60.5")).toBeNull();
    expect(centavosDeTexto("-10")).toBeNull();
    expect(centavosDeTexto("10,999")).toBeNull();
    expect(centavosDeTexto("abc")).toBeNull();
  });
  it("ida e volta sem perder centavo", () => {
    for (const c of [0, 1, 99, 1000, 2500, 6000, 10500, 24500, 123456]) {
      expect(centavosDeTexto(textoDeCentavos(c))).toBe(c);
    }
  });
});

describe("período do impulsionamento", () => {
  it("término = início + dias corridos", () => {
    const inicio = new Date(2026, 8, 25, 14, 30);
    expect(terminoDoImpulso(inicio, 7).getTime() - inicio.getTime()).toBe(7 * 86_400_000);
    expect(dataLonga(terminoDoImpulso(new Date(2026, 8, 25, 12), 30))).toBe("25/10/2026");
  });
  it("dias restantes", () => {
    expect(diasRestantesTexto(0)).toBe("termina hoje");
    expect(diasRestantesTexto(1)).toBe("1 dia");
    expect(diasRestantesTexto(12)).toBe("12 dias");
  });
});

describe("situação financeira", () => {
  it("rótulos", () => {
    expect(rotuloFinanceiro("pending_invoice")).toBe("Na próxima fatura");
    expect(rotuloFinanceiro("invoiced", "FC-2026-000012")).toBe("Na fatura FC-2026-000012");
    expect(rotuloFinanceiro("paid")).toBe("Pago");
    expect(rotuloFinanceiro("cancelled")).toBe("Não cobrado");
  });
  it("sem cobrança não aparece como pago", () => {
    expect(rotuloFinanceiro(null)).toBe("Sem custo");
  });
});

describe("em qual fatura entra", () => {
  it("com data da próxima fatura", () => {
    expect(
      quandoEntraNaFatura({
        next_invoice_at: new Date(2026, 9, 4, 12).toISOString(),
        cycle_type: "usage",
        cycle_end: null,
      }),
    ).toBe("na fatura de 04/10/2026");
  });
  it("no período grátis não inventa data", () => {
    expect(
      quandoEntraNaFatura({
        next_invoice_at: null,
        cycle_type: "free_trial",
        cycle_end: new Date(2026, 9, 19, 12).toISOString(),
      }),
    ).toBe("na primeira fatura depois do período grátis (que termina em 19/10/2026)");
    expect(quandoEntraNaFatura(null)).toBe("na próxima fatura");
  });
});

describe("quem pode contratar", () => {
  it("plano ativo pode", () => {
    expect(
      motivoParaNaoContratar({ can_contract: true, subscription_status: "active" }),
    ).toBeNull();
  });
  it("fatura atrasada, sem plano e plano pendente explicam o porquê", () => {
    expect(
      motivoParaNaoContratar({ can_contract: false, subscription_status: "past_due" }),
    ).toMatch(/fatura do FlyControl em aberto/);
    expect(motivoParaNaoContratar({ can_contract: false, subscription_status: null })).toMatch(
      /plano FlyControl ativo/,
    );
    expect(
      motivoParaNaoContratar({ can_contract: false, subscription_status: "pending_activation" }),
    ).toMatch(/Ative seu plano/);
  });
});

describe("contratação", () => {
  it("cada contratação tem uma chave própria", () => {
    const a = novaChaveDeContratacao();
    const b = novaChaveDeContratacao();
    expect(a).not.toBe(b);
    // O banco aceita chaves de 8 a 80 caracteres.
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(80);
  });
  it("erros do banco viram frases para o lojista", () => {
    expect(
      mensagemDoContrato({ message: "Limite de 3 campanhas ao mesmo tempo por loja." }),
    ).toMatch(/3 impulsionamentos/);
    expect(
      mensagemDoContrato({ message: "Este produto já tem uma campanha neste período." }),
    ).toMatch(/já está impulsionado/);
    expect(
      mensagemDoContrato({
        message: "Para impulsionar, sua loja precisa de um plano FlyControl ativo.",
      }),
    ).toBe("Para impulsionar, sua loja precisa de um plano FlyControl ativo.");
    expect(mensagemDoContrato({})).toMatch(/Tente de novo/);
  });
});

import { describe, expect, it } from "vitest";
import {
  contaNoLimite,
  motivoParaNaoImpulsionar,
  reaisDeCentavos,
  rotuloDoStatus,
  taxaDeCliques,
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

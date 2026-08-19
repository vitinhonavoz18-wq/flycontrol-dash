import { describe, expect, it } from "vitest";
import {
  CHECKOUT_LAYOUTS,
  DEFAULT_CHECKOUT_LAYOUT,
  normalizeCheckoutLayout,
} from "./checkoutLayout";

describe("modelo do checkout", () => {
  it("quem nunca escolheu continua no lateral — nenhum cliente atual muda sozinho", () => {
    for (const nunca of [undefined, null, "", "   ", {}, [], 0, false]) {
      expect(normalizeCheckoutLayout(nunca)).toBe("lateral");
    }
    expect(DEFAULT_CHECKOUT_LAYOUT).toBe("lateral");
  });

  it("valor escrito errado cai no lateral, em vez de quebrar a tela", () => {
    for (const errado of ["centro", "CENTRAL2", "drawer", "bottom-sheet", "lateral "]) {
      const resultado = normalizeCheckoutLayout(errado);
      expect(CHECKOUT_LAYOUTS).toContain(resultado);
    }
    expect(normalizeCheckoutLayout("centro")).toBe("lateral");
  });

  it("respeita a escolha explícita, sem se importar com maiúsculas ou espaços", () => {
    expect(normalizeCheckoutLayout("central")).toBe("central");
    expect(normalizeCheckoutLayout("CENTRAL")).toBe("central");
    expect(normalizeCheckoutLayout("  Central  ")).toBe("central");
    expect(normalizeCheckoutLayout("lateral")).toBe("lateral");
    expect(normalizeCheckoutLayout(" LATERAL ")).toBe("lateral");
  });
});

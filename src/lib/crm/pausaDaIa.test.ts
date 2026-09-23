import { describe, expect, it } from "vitest";
import { iaEstaPausada, pausarAte, MINUTOS_DE_PAUSA_DA_IA } from "./pausaDaIa";

describe("trava da IA", () => {
  const agora = new Date("2026-09-23T12:00:00.000Z");

  it("pausa pelo tempo padrão", () => {
    const ate = pausarAte(agora);
    expect(Date.parse(ate) - agora.getTime()).toBe(MINUTOS_DE_PAUSA_DA_IA * 60_000);
    expect(iaEstaPausada(ate, agora)).toBe(true);
  });

  it("vence sozinha", () => {
    const ate = pausarAte(agora, 30);
    expect(iaEstaPausada(ate, new Date("2026-09-23T12:31:00.000Z"))).toBe(false);
  });

  it("vazio ou lixo não trava", () => {
    expect(iaEstaPausada(null, agora)).toBe(false);
    expect(iaEstaPausada(undefined, agora)).toBe(false);
    expect(iaEstaPausada("não é data", agora)).toBe(false);
  });
});

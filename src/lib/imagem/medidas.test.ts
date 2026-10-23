import { describe, expect, it } from "vitest";
import { LIMITE_CAPA, LIMITE_LOGO, medidasFinais } from "./medidas";

describe("medidasFinais", () => {
  it("guarda a capa grande em alta resolução, sem distorcer", () => {
    expect(medidasFinais(4000, 2250, LIMITE_CAPA)).toEqual({ largura: 2400, altura: 1350 });
  });

  it("foto de produto continua leve, no limite de 900", () => {
    expect(medidasFinais(4000, 2250, 900)).toEqual({ largura: 900, altura: 506 });
  });

  it("logo em pé respeita o maior lado", () => {
    expect(medidasFinais(1500, 3000, LIMITE_LOGO)).toEqual({ largura: 600, altura: 1200 });
  });

  it("nunca aumenta uma foto pequena", () => {
    expect(medidasFinais(640, 480, LIMITE_CAPA)).toEqual({ largura: 640, altura: 480 });
  });
});

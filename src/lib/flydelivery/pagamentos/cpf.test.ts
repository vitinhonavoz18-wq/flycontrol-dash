import { describe, expect, it } from "vitest";
import { cpfValido, mascararCpf } from "./cpf";

describe("CPF do pagador", () => {
  it("aceita CPF com dígitos verificadores certos, com ou sem pontuação", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });

  it("recusa CPF errado, incompleto ou repetido", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("1234")).toBe(false);
    expect(cpfValido(null)).toBe(false);
    expect(cpfValido(52998224725)).toBe(false);
  });

  it("nunca mostra o CPF inteiro", () => {
    expect(mascararCpf("52998224725")).toBe("***.***.*47-25");
    expect(mascararCpf("x")).toBe("***");
  });
});

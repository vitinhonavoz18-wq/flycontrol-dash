import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfiguracaoDeImpressao } from "./ConfiguracaoDeImpressao";
import { lerPerfisDaLoja, perfilAtivo } from "@/lib/impressao/perfil";

afterEach(() => window.localStorage.clear());

function linhasDaPrevia(): string[] {
  const previa = screen.getByRole("document", { name: "Comanda" });
  return Array.from(previa.querySelectorAll(".l")).map((l) => l.textContent ?? "");
}

describe("aba Impressão", () => {
  it("mostra a prévia da comanda no perfil seguro", async () => {
    render(<ConfiguracaoDeImpressao lojaId="loja-1" nomeDaLoja="Loja" />);
    await screen.findByRole("document", { name: "Comanda" });
    const linhas = linhasDaPrevia();
    expect(linhas.some((l) => l.includes("ITENS DO PEDIDO"))).toBe(true);
    expect(Math.max(...linhas.map((l) => l.length))).toBeLessThanOrEqual(42);
  });

  it("escolher 58 mm muda a prévia para 32 letras e fica guardado", async () => {
    render(<ConfiguracaoDeImpressao lojaId="loja-2" />);
    await screen.findByRole("document", { name: "Comanda" });
    fireEvent.click(screen.getByRole("button", { name: "Bobina 58 mm" }));
    expect(linhasDaPrevia()[0]).toBe("=".repeat(32));
    expect(perfilAtivo(lerPerfisDaLoja("loja-2")).papel).toBe("58");
  });

  it("tirar os acentos vale na prévia", async () => {
    render(<ConfiguracaoDeImpressao lojaId="loja-3" />);
    await screen.findByRole("document", { name: "Comanda" });
    fireEvent.click(screen.getByRole("switch", { name: /Tirar os acentos/ }));
    expect(linhasDaPrevia().join("\n")).not.toMatch(/[À-ÿ]/);
  });

  it("teste de alinhamento mostra a régua do tamanho exato", async () => {
    render(<ConfiguracaoDeImpressao lojaId="loja-4" />);
    await screen.findByRole("document", { name: "Comanda" });
    fireEvent.click(screen.getByRole("button", { name: "Bobina 80 mm" }));
    fireEvent.click(screen.getByRole("button", { name: "Alinhamento" }));
    expect(linhasDaPrevia()).toContain("123456789012345678901234567890123456789012345678");
  });

  it("letras por linha só gravam ao sair do campo (digitar 48 não pula para 24)", async () => {
    render(<ConfiguracaoDeImpressao lojaId="loja-5" />);
    const campo = await screen.findByLabelText("Letras por linha");
    fireEvent.change(campo, { target: { value: "4" } });
    expect(perfilAtivo(lerPerfisDaLoja("loja-5")).colunas).toBe(42);
    fireEvent.change(campo, { target: { value: "40" } });
    fireEvent.blur(campo);
    expect(perfilAtivo(lerPerfisDaLoja("loja-5")).colunas).toBe(40);
    expect(
      within(screen.getByRole("document", { name: "Comanda" })).getAllByText(/^=+$/)[0].textContent,
    ).toHaveLength(40);
  });
});

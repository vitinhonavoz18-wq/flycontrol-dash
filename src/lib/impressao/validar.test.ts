import { describe, expect, it } from "vitest";
import { dadosDoPedido } from "./comanda";
import { comandaDeExemplo, LOJA_DE_EXEMPLO, PEDIDO_DE_EXEMPLO } from "./exemplos";
import { diagnosticoEmTexto, montarDiagnostico, resumirNavegador } from "./diagnostico";
import { perfilPadrao } from "./perfil";
import { validarDados, validarLinhas } from "./validar";

describe("conferência antes de imprimir", () => {
  it("comanda de exemplo passa sem erro", () => {
    const p = perfilPadrao("58");
    expect(validarLinhas(comandaDeExemplo(p), p).filter((a) => a.nivel === "erro")).toEqual([]);
  });

  it("acusa linha mais larga que o papel", () => {
    const p = perfilPadrao("58");
    const avisos = validarLinhas([{ texto: "x".repeat(40), estilo: "normal" }], p);
    expect(avisos.map((a) => a.codigo)).toContain("linha-larga");
  });

  it("acusa quebra de linha escondida dentro de uma linha", () => {
    const p = perfilPadrao("80");
    const avisos = validarLinhas([{ texto: "a\rb", estilo: "normal" }], p);
    expect(avisos.map((a) => a.codigo)).toContain("quebra-escondida");
  });

  it("acusa acento quando o perfil é sem acentos", () => {
    const p = { ...perfilPadrao("80"), acentos: false };
    const avisos = validarLinhas([{ texto: "ação", estilo: "normal" }], p);
    expect(avisos.map((a) => a.codigo)).toContain("letra-invalida");
  });

  it("avisa quando a letra fica pequena demais", () => {
    const p = { ...perfilPadrao("58"), colunas: 64 };
    expect(validarLinhas([], p).map((a) => a.codigo)).toContain("letra-pequena");
  });

  it("entrega sem endereço e pedido sem itens são avisados", () => {
    const dados = dadosDoPedido({ order_type: "delivery", total: 10, items: [] }, null);
    const codigos = validarDados(dados).map((a) => a.codigo);
    expect(codigos).toContain("sem-endereco");
    expect(codigos).toContain("sem-itens");
  });
});

describe("diagnóstico para o suporte", () => {
  it("não leva nenhum dado do cliente", () => {
    const p = perfilPadrao("58");
    const linhas = comandaDeExemplo(p);
    const dados = dadosDoPedido(PEDIDO_DE_EXEMPLO, LOJA_DE_EXEMPLO);
    const d = montarDiagnostico({
      perfil: p,
      linhas,
      avisos: [...validarLinhas(linhas, p), ...validarDados(dados)],
      navegador:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    const t = diagnosticoEmTexto(d);
    for (const pessoal of ["João", "99999", "Rua Exemplo", "Stella Maris", "Interfone"]) {
      expect(t).not.toContain(pessoal);
    }
    expect(t).toContain("Letras por linha: 32");
    expect(t).toContain("Chrome/130 · Windows");
    expect(t).toContain("PrintNode: não configurado");
  });

  it("resume o navegador sem a 'impressão digital' completa", () => {
    expect(
      resumirNavegador(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      ),
    ).toBe("Edge/130 · Windows");
    expect(resumirNavegador("")).toBe("desconhecido");
  });
});

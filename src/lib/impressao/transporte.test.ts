import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { imprimirDocumento, imprimirPeloNavegador } from "./transporte";

describe("envio pelo navegador", () => {
  it("abre a janela de impressão uma vez", async () => {
    const janela = { print: vi.fn() };
    const r = await imprimirPeloNavegador(null, janela);
    expect(r).toEqual({ ok: true, metodo: "navegador" });
    expect(janela.print).toHaveBeenCalledTimes(1);
  });

  it("clique duplo não abre duas impressões (comanda duplicada)", async () => {
    const janela = { print: vi.fn() };
    const [a, b] = await Promise.all([
      imprimirPeloNavegador(null, janela),
      imprimirPeloNavegador(null, janela),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(janela.print).toHaveBeenCalledTimes(1);
    // Depois que a primeira termina, uma nova impressão é aceita.
    expect((await imprimirPeloNavegador(null, janela)).ok).toBe(true);
  });

  it("falha do navegador vira mensagem clara, sem travar as próximas", async () => {
    const quebrada = {
      print: () => {
        throw new Error("bloqueado pelo navegador");
      },
    };
    const r = await imprimirPeloNavegador(null, quebrada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("falhou");
      expect(r.mensagem).toContain("bloqueado pelo navegador");
    }
    expect((await imprimirPeloNavegador(null, { print: vi.fn() })).ok).toBe(true);
  });

  it("sem navegador (no servidor) não quebra", async () => {
    const r = await imprimirPeloNavegador(null, null);
    expect(r.ok).toBe(false);
  });
});

describe("impressão em quadro separado", () => {
  it("escreve a página no quadro e imprime o quadro, não a tela inteira", async () => {
    const printDaTela = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const impressos: string[] = [];
    const anexar = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(no: T): T => {
      const r = anexar(no);
      if (no instanceof HTMLIFrameElement && no.contentWindow) {
        const quadro = no;
        no.contentWindow.print = () => {
          impressos.push(quadro.contentDocument?.body.innerHTML ?? "");
        };
      }
      return r;
    });
    const r = await imprimirDocumento(
      "<!doctype html><html><body><p>comanda 123</p></body></html>",
    );
    vi.restoreAllMocks();
    expect(r).toEqual({ ok: true, metodo: "navegador" });
    expect(printDaTela).not.toHaveBeenCalled();
    expect(impressos).toHaveLength(1);
    expect(impressos[0]).toContain("comanda 123");
  });
});

describe("a página da comanda do pedido", () => {
  const pagina = readFileSync("src/routes/print.$orderId.tsx", "utf8");

  it("usa o formatador central, não monta a comanda à mão", () => {
    expect(pagina).toContain("montarComanda");
    expect(pagina).toContain("<ComandaImpressa");
  });

  it("abre a impressão sozinha uma única vez, esperando logo e letras", () => {
    expect(pagina).toContain("imprimirPeloNavegador");
    expect(pagina).toContain("jaAbriu.current = true");
  });
});

describe("a comanda da mesa", () => {
  const tela = readFileSync("src/components/TablesManagement.tsx", "utf8");
  it("usa o formatador central e o quadro separado", () => {
    const trecho = tela.slice(tela.indexOf("async function handlePrintComanda"));
    expect(trecho).toContain("montarComandaDaMesa");
    expect(trecho).toContain("imprimirDocumento(");
    expect(trecho.slice(0, 3000)).not.toContain("document.write(");
  });
});

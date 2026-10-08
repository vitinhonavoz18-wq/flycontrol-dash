import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAPEIS,
  esperarConteudoCarregar,
  estiloDeImpressao,
  lerPapelSalvo,
  medidasDoPapel,
  salvarPapel,
  type Papel,
} from "./papel";

const TODOS: Papel[] = ["auto", "80", "58", "a4"];

describe("a comanda segue o papel da impressora", () => {
  it("nunca força o tamanho da folha", () => {
    // Era `size: 80mm auto` — regra inválida que cada navegador lia de um
    // jeito. E forçar um tamanho válido faz parte das térmicas recusarem a
    // folha "personalizada". A folha é sempre a que a impressora tem.
    for (const papel of TODOS) {
      expect(estiloDeImpressao(papel)).not.toMatch(/@page\s*\{[^}]*\bsize\s*:/);
    }
  });

  it("no automático, a comanda fica à esquerda e se ajusta à largura da folha", () => {
    // Centralizar numa folha que a impressora diz ser A4 jogava a comanda
    // para o meio — fora do pedaço de bobina que existe de verdade.
    const m = medidasDoPapel("auto");
    expect(m.centralizar).toBe(false);
    expect(m.larguraDaComanda).toBe("100%");
    expect(m.larguraDoCorpo).toBe("auto");
    expect(estiloDeImpressao("auto")).toContain("margin: 0 !important");
  });

  it("no automático, folha estreita ganha letra compacta", () => {
    expect(estiloDeImpressao("auto")).toMatch(/@media print and \(max-width: 65mm\)/);
  });

  it("bobina de 58 mm cabe na área que a cabeça de impressão alcança", () => {
    const m = medidasDoPapel("58");
    expect(m.larguraDoCorpo).toBe("58mm");
    expect(m.larguraMaxima).toBe("52mm"); // 48 mm de texto + 2 mm de cada lado
    expect(m.letraBase).toBe("12px");
  });

  it("bobina de 80 mm continua com as medidas de sempre", () => {
    // Quem já imprimia bem na térmica de 80 mm não pode perceber diferença.
    const m = medidasDoPapel("80");
    expect(m.larguraDoCorpo).toBe("80mm");
    expect(m.larguraDaComanda).toBe("76mm");
    expect(m.centralizar).toBe(true);
  });

  it("tudo sai em preto puro e sem fundo", () => {
    // Térmica não tem cinza: texto cinza some, fundo cinza sai pontilhado.
    for (const papel of TODOS) {
      const css = estiloDeImpressao(papel);
      expect(css).toContain("color: #000 !important");
      expect(css).toContain("background: transparent !important");
    }
  });

  it("o resto do sistema não ocupa espaço no papel", () => {
    // Esconder sem tirar do lugar deixava avisos e janelinhas ocupando
    // espaço invisível — bobina gasta em branco.
    expect(estiloDeImpressao("auto")).toMatch(/display: none !important/);
  });

  it("toda opção tem nome e explicação para o lojista", () => {
    expect(PAPEIS.map((p) => p.id)).toEqual(TODOS);
    for (const p of PAPEIS) {
      expect(p.rotulo.length).toBeGreaterThan(3);
      expect(p.ajuda.length).toBeGreaterThan(10);
    }
  });
});

describe("a escolha fica guardada no computador", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("lembra a escolha", () => {
    salvarPapel("58");
    expect(lerPapelSalvo()).toBe("58");
  });

  it("sem escolha, ou com valor estranho, usa o automático", () => {
    expect(lerPapelSalvo()).toBe("auto");
    window.localStorage.setItem("flycontrol:papel-da-comanda", "papel-de-pão");
    expect(lerPapelSalvo()).toBe("auto");
  });

  it("navegador sem armazenamento não impede a impressão", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => salvarPapel("80")).not.toThrow();
    expect(lerPapelSalvo()).toBe("auto");
  });
});

describe("a impressão espera a logo", () => {
  it("espera a imagem terminar de carregar", async () => {
    const raiz = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false });
    raiz.appendChild(img);

    let terminou = false;
    const espera = esperarConteudoCarregar(raiz, 5000).then(() => {
      terminou = true;
    });
    await Promise.resolve();
    expect(terminou).toBe(false);

    img.dispatchEvent(new Event("load"));
    await espera;
    expect(terminou).toBe(true);
  });

  it("logo que nunca chega não trava a impressão", async () => {
    vi.useFakeTimers();
    const raiz = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false });
    raiz.appendChild(img);

    const espera = esperarConteudoCarregar(raiz, 4000);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(espera).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("a página da comanda", () => {
  const pagina = readFileSync("src/routes/print.$orderId.tsx", "utf8");

  it('o "Tipo" não depende de fundo preto para aparecer', () => {
    // O navegador não imprime fundo por padrão: letra branca em fundo preto
    // virava branco no branco.
    expect(pagina).not.toMatch(/bg-black[^"]*text-white[^"]*uppercase/);
    expect(pagina).toContain("border-2 border-black");
  });

  it("não abre a impressão num tempo fixo antes da logo chegar", () => {
    expect(pagina).not.toMatch(/setTimeout\(\(\) => window\.print\(\), 800\)/);
    expect(pagina).toContain("esperarConteudoCarregar");
  });
});

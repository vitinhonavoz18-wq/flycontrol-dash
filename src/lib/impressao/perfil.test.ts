import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COLUNAS_SUGERIDAS,
  lerPerfisDaLoja,
  normalizarPerfil,
  perfilAtivo,
  perfilPadrao,
  salvarPerfisDaLoja,
  tamanhoDaLetraMm,
  trocarPapel,
} from "./perfil";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("perfil seguro", () => {
  it("sem nada configurado: automático, navegador, com acentos", () => {
    const p = perfilPadrao();
    expect(p.papel).toBe("auto");
    expect(p.metodo).toBe("navegador");
    expect(p.colunas).toBe(COLUNAS_SUGERIDAS.auto.padrao);
    expect(p.acentos).toBe(true);
    expect(p.abrirGaveta).toBe(false);
  });

  it("valores quebrados ou fora do limite viram valores seguros", () => {
    const p = normalizarPerfil({
      papel: "papel-de-pão",
      colunas: 9999,
      margemMm: -5,
      espacamento: "abc",
      linhasNoFinal: 1e9,
      marca: "inexistente",
      metodo: "telepatia",
      abrirGaveta: "sim",
    });
    expect(p.papel).toBe("auto");
    expect(p.colunas).toBe(80);
    expect(p.margemMm).toBe(0);
    expect(p.espacamento).toBe(1.15);
    expect(p.linhasNoFinal).toBe(10);
    expect(p.marca).toBe("generica");
    expect(p.metodo).toBe("navegador");
    expect(p.abrirGaveta).toBe(false);
  });

  it("trocar o papel ajusta as letras por linha", () => {
    expect(trocarPapel(perfilPadrao("80"), "58").colunas).toBe(32);
    expect(trocarPapel(perfilPadrao("58"), "80").colunas).toBe(48);
  });

  it("a letra cabe: colunas × largura da letra = largura útil", () => {
    for (const papel of ["58", "80"] as const) {
      const p = perfilPadrao(papel);
      const util = (papel === "58" ? 52 : 76) - 2 * p.margemMm;
      expect(p.colunas * tamanhoDaLetraMm(p) * 0.6).toBeLessThanOrEqual(util);
      // E não sobra muito papel: no máximo a folga de 2%.
      expect(p.colunas * tamanhoDaLetraMm(p) * 0.6).toBeGreaterThan(util * 0.97);
    }
  });
});

describe("guardado por loja, neste computador", () => {
  it("lembra os perfis da loja", () => {
    const p = perfilPadrao("58", "Cozinha");
    salvarPerfisDaLoja("loja-a", { ativoId: p.id, perfis: [p] });
    const lido = lerPerfisDaLoja("loja-a");
    expect(perfilAtivo(lido).nome).toBe("Cozinha");
    expect(perfilAtivo(lido).papel).toBe("58");
  });

  it("duas lojas no mesmo computador não misturam a configuração", () => {
    const a = perfilPadrao("58", "Caixa A");
    const b = perfilPadrao("80", "Caixa B");
    salvarPerfisDaLoja("loja-a", { ativoId: a.id, perfis: [a] });
    salvarPerfisDaLoja("loja-b", { ativoId: b.id, perfis: [b] });
    expect(perfilAtivo(lerPerfisDaLoja("loja-a")).nome).toBe("Caixa A");
    expect(perfilAtivo(lerPerfisDaLoja("loja-b")).nome).toBe("Caixa B");
  });

  it("várias impressoras na mesma loja, uma escolhida", () => {
    const caixa = perfilPadrao("80", "Caixa");
    const cozinha = perfilPadrao("58", "Cozinha");
    salvarPerfisDaLoja("loja", { ativoId: cozinha.id, perfis: [caixa, cozinha] });
    const lido = lerPerfisDaLoja("loja");
    expect(lido.perfis.map((p) => p.nome)).toEqual(["Caixa", "Cozinha"]);
    expect(perfilAtivo(lido).nome).toBe("Cozinha");
  });

  it("quem já tinha escolhido o papel na versão anterior não perde a escolha", () => {
    window.localStorage.setItem("flycontrol:papel-da-comanda", "58");
    const p = perfilAtivo(lerPerfisDaLoja("loja-antiga"));
    expect(p.papel).toBe("58");
    expect(p.colunas).toBe(32);
  });

  it("dado corrompido ou navegador sem armazenamento: segue com o perfil seguro", () => {
    window.localStorage.setItem("flycontrol:perfis-de-impressao:x", "{não é json");
    expect(perfilAtivo(lerPerfisDaLoja("x")).papel).toBe("auto");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => salvarPerfisDaLoja("x", lerPerfisDaLoja("x"))).not.toThrow();
    expect(perfilAtivo(lerPerfisDaLoja("x")).papel).toBe("auto");
  });

  it("perfil escolhido que não existe mais cai no primeiro", () => {
    const p = perfilPadrao("80");
    salvarPerfisDaLoja("loja", { ativoId: "sumiu", perfis: [p] });
    expect(perfilAtivo(lerPerfisDaLoja("loja")).id).toBe(p.id);
  });
});

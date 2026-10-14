import { describe, expect, it } from "vitest";
import {
  TODOS_OS_ESTABELECIMENTOS,
  escopoDaBusca,
  filtroDeTipoDoPedido,
  termoDeBuscaDeLoja,
} from "./buscaDePedidos";

describe("escopoDaBusca", () => {
  it("administrador com 'todos' busca em todas as lojas", () => {
    expect(
      escopoDaBusca({
        isSuperAdmin: true,
        lojaEscolhida: TODOS_OS_ESTABELECIMENTOS,
        minhasLojas: [],
      }),
    ).toEqual({ tipo: "todas" });
  });

  it("administrador sem escolha também cai em 'todas'", () => {
    expect(escopoDaBusca({ isSuperAdmin: true, lojaEscolhida: "", minhasLojas: [] })).toEqual({
      tipo: "todas",
    });
  });

  it("administrador com loja escolhida busca só nela", () => {
    expect(escopoDaBusca({ isSuperAdmin: true, lojaEscolhida: "loja-x", minhasLojas: [] })).toEqual(
      { tipo: "uma", lojaId: "loja-x" },
    );
  });

  it("dono nunca ganha a busca global, mesmo forçando 'todos'", () => {
    expect(
      escopoDaBusca({
        isSuperAdmin: false,
        lojaEscolhida: TODOS_OS_ESTABELECIMENTOS,
        minhasLojas: ["a", "b"],
      }),
    ).toEqual({ tipo: "minhas", lojaIds: ["a", "b"] });
  });

  it("dono que força o id de uma loja alheia continua vendo só as dele", () => {
    expect(
      escopoDaBusca({ isSuperAdmin: false, lojaEscolhida: "loja-alheia", minhasLojas: ["a"] }),
    ).toEqual({ tipo: "minhas", lojaIds: ["a"] });
  });

  it("dono pode restringir a uma das próprias lojas", () => {
    expect(
      escopoDaBusca({ isSuperAdmin: false, lojaEscolhida: "b", minhasLojas: ["a", "b"] }),
    ).toEqual({ tipo: "uma", lojaId: "b" });
  });

  it("dono sem loja não busca nada", () => {
    expect(escopoDaBusca({ isSuperAdmin: false, lojaEscolhida: "", minhasLojas: [] })).toEqual({
      tipo: "nenhuma",
    });
  });
});

describe("filtroDeTipoDoPedido", () => {
  it("'todos' não filtra", () => {
    expect(filtroDeTipoDoPedido("all")).toBeNull();
    expect(filtroDeTipoDoPedido("qualquer")).toBeNull();
  });

  it("toda condição vem protegida contra campo vazio", () => {
    for (const t of ["table", "pickup", "delivery"]) {
      const f = filtroDeTipoDoPedido(t)!;
      const testes = f.match(/\b(\w+)\.(ilike|like)\./g) ?? [];
      expect(testes.length).toBeGreaterThan(0);
      for (const teste of testes) {
        const col = teste.split(".")[0];
        expect(f).toContain(`and(${col}.not.is.null,${teste}`);
      }
    }
  });

  it("delivery = nem mesa, nem retirada; retirada = não mesa e retirada", () => {
    const mesa = filtroDeTipoDoPedido("table")!;
    expect(filtroDeTipoDoPedido("pickup")).toMatch(/^and\(not\.or\(.+\),or\(.+\)\)$/);
    expect(filtroDeTipoDoPedido("delivery")).toMatch(/^and\(not\.or\(.+\),not\.or\(.+\)\)$/);
    expect(filtroDeTipoDoPedido("delivery")).toContain(`not.or(${mesa})`);
  });

  it("parênteses sempre balanceados", () => {
    for (const t of ["table", "pickup", "delivery"]) {
      const f = filtroDeTipoDoPedido(t)!;
      let n = 0;
      for (const c of f) {
        if (c === "(") n++;
        if (c === ")") n--;
        expect(n).toBeGreaterThanOrEqual(0);
      }
      expect(n).toBe(0);
    }
  });
});

describe("termoDeBuscaDeLoja", () => {
  it("remove curingas e caracteres que quebram o filtro", () => {
    expect(termoDeBuscaDeLoja("  Pizza%_ (Centro), * ")).toBe("Pizza Centro");
  });
  it("limita o tamanho", () => {
    expect(termoDeBuscaDeLoja("a".repeat(200))).toHaveLength(80);
  });
});

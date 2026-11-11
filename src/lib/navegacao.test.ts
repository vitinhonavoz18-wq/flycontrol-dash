import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GRUPO_DA_PLATAFORMA,
  GRUPOS_DO_MENU,
  itemEstaAtivo,
  montarMenu,
  type ItemDeMenu,
} from "./navegacao";
import type { Feature } from "./planPermissions";

/**
 * Guardas do menu lateral.
 *
 * O menu é o mapa do sistema. Três jeitos de ele mentir para o lojista:
 * apontar para uma tela que não existe, mostrar algo que o plano dele não
 * inclui, ou mostrar a administração da plataforma para quem é só lojista.
 */

const todos = (grupos = GRUPOS_DO_MENU) => grupos.flatMap((g) => g.itens);
const tudoLiberado = () => true;

/** Onde mora o arquivo da tela de um endereço do menu. */
function arquivoDaRota(to: string): string[] {
  const nome = to.replace(/^\//, "").replace(/\//g, ".");
  return [
    `src/routes/_app/${nome}.tsx`,
    `src/routes/_app/${nome}.index.tsx`,
    `src/routes/_app/${nome.replace(/\./g, "/")}.tsx`,
    `src/routes/_app/${nome.replace(/\./g, "/")}/index.tsx`,
  ];
}

describe("o menu lateral", () => {
  it("todo item abre uma tela que existe de verdade", () => {
    for (const item of [...todos(), ...GRUPO_DA_PLATAFORMA.itens]) {
      expect(
        arquivoDaRota(item.to).some((arquivo) => existsSync(arquivo)),
        `sem tela para ${item.to}`,
      ).toBe(true);
    }
  });

  it("nenhum endereço e nenhum rótulo aparecem duas vezes", () => {
    const itens = [...todos(), ...GRUPO_DA_PLATAFORMA.itens];
    expect(new Set(itens.map((i) => i.to)).size).toBe(itens.length);
    expect(new Set(itens.map((i) => i.label)).size).toBe(itens.length);
  });

  it("nenhuma tela que existia no menu antigo ficou de fora", () => {
    const destinos = todos().map((i) => i.to);
    for (const antigo of [
      "/dashboard",
      "/tables",
      "/search-orders",
      "/my-store",
      "/menu",
      "/inventory",
      "/flydelivery",
      "/combos",
      "/marketing",
      "/chat",
      "/finance",
      "/billing",
      "/settings",
      "/waiters",
      "/commissions",
      "/docs",
    ]) {
      expect(destinos, antigo).toContain(antigo);
    }
  });

  it("os grupos seguem a ordem do dia: operar, gerir, crescer, administrar", () => {
    expect(GRUPOS_DO_MENU.map((g) => g.titulo)).toEqual([
      "Operação",
      "Gestão",
      "Crescimento",
      "Administração",
    ]);
    // Pedidos é a primeira coisa do menu: é onde o lojista passa o dia.
    expect(GRUPOS_DO_MENU[0].itens[0]).toMatchObject({ to: "/dashboard", label: "Pedidos" });
  });

  it("a tela do aplicativo do cliente diz 'App', para não se confundir com o painel", () => {
    const item = todos().find((i) => i.to === "/flydelivery");
    expect(item?.label).toBe("App FlyDelivery");
  });
});

describe("quem vê o quê", () => {
  it("lojista não vê a administração da plataforma", () => {
    const menu = montarMenu({ temRecurso: tudoLiberado, ehAdminDaPlataforma: false });
    expect(menu.map((g) => g.id)).not.toContain("plataforma");
    expect(todos(menu).some((i) => i.to.startsWith("/admin"))).toBe(false);
  });

  it("administrador da plataforma vê o bloco global, e não vê 'Plano e cobrança'", () => {
    const menu = montarMenu({ temRecurso: tudoLiberado, ehAdminDaPlataforma: true });
    expect(menu.at(-1)?.id).toBe("plataforma");
    expect(todos(menu).map((i) => i.to)).not.toContain("/billing");
    expect(todos(menu).map((i) => i.to)).toContain("/admin/subscriptions");
  });

  it("recurso fora do plano some do menu", () => {
    const semExtras = (recurso: Feature) =>
      !["tables", "inventory", "waiters", "commissions", "chat"].includes(recurso);
    const destinos = todos(montarMenu({ temRecurso: semExtras, ehAdminDaPlataforma: false })).map(
      (i) => i.to,
    );
    for (const fora of ["/tables", "/inventory", "/waiters", "/commissions", "/chat"]) {
      expect(destinos).not.toContain(fora);
    }
    // O essencial continua para qualquer plano.
    for (const dentro of ["/dashboard", "/menu", "/finance", "/billing", "/settings"]) {
      expect(destinos).toContain(dentro);
    }
  });

  it("grupo que fica vazio some junto com o título", () => {
    const nada = montarMenu({ temRecurso: () => false, ehAdminDaPlataforma: false });
    for (const grupo of nada) expect(grupo.itens.length).toBeGreaterThan(0);
  });
});

describe("item aceso", () => {
  const estoque = todos().find((i) => i.to === "/inventory") as ItemDeMenu;
  const cardapio = todos().find((i) => i.to === "/menu") as ItemDeMenu;

  it("acende no próprio endereço", () => {
    expect(itemEstaAtivo(cardapio, "/menu")).toBe(true);
    expect(itemEstaAtivo(cardapio, "/marketing")).toBe(false);
  });

  it("tela com sub-telas continua acesa dentro delas", () => {
    expect(itemEstaAtivo(estoque, "/inventory/products")).toBe(true);
  });

  it("endereço parecido não acende o item errado", () => {
    // "/menus-antigos" começa com "/menu", mas não é o Cardápio.
    expect(itemEstaAtivo(cardapio, "/menus-antigos")).toBe(false);
    expect(itemEstaAtivo(estoque, "/inventory-export")).toBe(false);
  });
});

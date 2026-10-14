import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tela "Buscar Pedidos": confere QUEM vê o campo Estabelecimento e O QUE a
 * tela pede ao banco em cada caso. O banco em si (regras de acesso por linha)
 * não roda aqui — ver o relatório da tarefa.
 */

type Chamada = { tabela: string; metodo: string; args: unknown[] };

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: "dono-1" } as { id: string } | null,
    isSuperAdmin: false,
    rolesLoading: false,
  },
  chamadas: [] as Chamada[],
  respostas: {} as Record<string, { data: unknown; error: unknown; count?: number }>,
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));

vi.mock("@/integrations/supabase/client", () => {
  function construtor(tabela: string) {
    const alvo: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(alvo, {
      get(_t, prop: string) {
        if (prop === "then") {
          const r = mocks.respostas[tabela] ?? { data: [], error: null, count: 0 };
          return (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok);
        }
        return (...args: unknown[]) => {
          mocks.chamadas.push({ tabela, metodo: prop, args });
          return proxy;
        };
      },
    });
    return proxy;
  }
  return { supabase: { from: (t: string) => construtor(t) } };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { Route } from "./search-orders";

const Pagina = Route.options.component as React.ComponentType;

function chamadas(tabela: string, metodo?: string) {
  return mocks.chamadas.filter((c) => c.tabela === tabela && (!metodo || c.metodo === metodo));
}

const pedido = {
  id: "p1",
  order_number: 1542,
  tenant_id: "loja-a",
  customer_name: "João Silva",
  customer_phone: "11999990000",
  customer_address: "Rua 1",
  neighborhood: null,
  items: [],
  total: 59.9,
  delivery_fee: 0,
  payment_method: "pix",
  notes: null,
  status: "entregue",
  created_at: "2026-10-01T12:00:00Z",
  order_type: "delivery",
  service_mode: "delivery",
  table_number: null,
  table_name: null,
  payment_status: null,
  loja: { name: "Hamburgueria Central" },
};

beforeEach(() => {
  mocks.chamadas = [];
  mocks.respostas = {};
  mocks.auth = { user: { id: "dono-1" }, isSuperAdmin: false, rolesLoading: false };
  // jsdom não tem estas APIs usadas pelo seletor pesquisável.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

describe("Buscar Pedidos — dono de loja", () => {
  it("não vê o campo Estabelecimento e busca só nas próprias lojas", async () => {
    mocks.respostas.pizzerias = { data: [{ id: "loja-a" }], error: null };
    mocks.respostas.orders = { data: [], error: null, count: 0 };
    render(<Pagina />);

    expect(screen.queryByText("Estabelecimento")).not.toBeInTheDocument();
    await waitFor(() => expect(chamadas("pizzerias", "eq")).toHaveLength(1));
    expect(chamadas("pizzerias", "eq")[0].args).toEqual(["owner_id", "dono-1"]);

    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    await waitFor(() => expect(chamadas("orders", "in")).toHaveLength(1));
    expect(chamadas("orders", "in")[0].args).toEqual(["tenant_id", ["loja-a"]]);
    expect(chamadas("orders", "eq").filter((c) => c.args[0] === "tenant_id")).toHaveLength(0);
    // Contagem paginada no servidor.
    expect(chamadas("orders", "range")[0].args).toEqual([0, 49]);
    expect(
      await screen.findAllByText(/Nenhum pedido encontrado para os filtros selecionados/),
    ).not.toHaveLength(0);
  });
});

describe("Buscar Pedidos — administrador geral", () => {
  beforeEach(() => {
    mocks.auth = { user: { id: "admin-1" }, isSuperAdmin: true, rolesLoading: false };
  });

  it("vê o campo antes de Nome do Cliente, com 'Todos os estabelecimentos' por padrão", () => {
    const { container } = render(<Pagina />);
    const rotulos = Array.from(container.querySelectorAll("label")).map((l) => l.textContent);
    expect(rotulos.slice(0, 2)).toEqual(["Estabelecimento", "Nome do Cliente"]);
    expect(screen.getByRole("combobox", { name: "Estabelecimento" })).toHaveTextContent(
      "Todos os estabelecimentos",
    );
  });

  it("'Todos' busca sem filtro de loja, mostra a loja de cada pedido e a contagem real", async () => {
    mocks.respostas.orders = { data: [pedido], error: null, count: 137 };
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));

    expect((await screen.findAllByText("Hamburgueria Central")).length).toBeGreaterThan(0);
    expect(screen.getByText("137 pedido(s)")).toBeInTheDocument();
    expect(chamadas("orders", "in")).toHaveLength(0);
    expect(chamadas("orders", "eq").filter((c) => c.args[0] === "tenant_id")).toHaveLength(0);
    expect(String(chamadas("orders", "select")[0].args[0])).toContain(
      "loja:pizzerias!orders_tenant_id_fkey(name)",
    );
    expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();
  });

  it("pesquisa lojas no banco, escolhe uma e combina com os outros filtros", async () => {
    mocks.respostas.pizzerias = {
      data: [
        { id: "loja-a", name: "Hamburgueria Central" },
        { id: "loja-b", name: "Pizzaria do Bairro" },
      ],
      error: null,
    };
    mocks.respostas.orders = { data: [pedido], error: null, count: 1 };
    render(<Pagina />);

    fireEvent.click(screen.getByRole("combobox", { name: "Estabelecimento" }));
    fireEvent.change(await screen.findByPlaceholderText("Pesquisar estabelecimento..."), {
      target: { value: "Hamb" },
    });
    await waitFor(() =>
      expect(chamadas("pizzerias", "ilike").map((c) => c.args)).toContainEqual(["name", "%Hamb%"]),
    );
    fireEvent.click(await screen.findByText("Hamburgueria Central"));
    expect(screen.getByRole("combobox", { name: "Estabelecimento" })).toHaveTextContent(
      "Hamburgueria Central",
    );

    fireEvent.change(screen.getByPlaceholderText("Ex: João"), { target: { value: "João" } });
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));

    await waitFor(() => expect(chamadas("orders", "eq").length).toBeGreaterThan(0));
    expect(chamadas("orders", "eq").map((c) => c.args)).toContainEqual(["tenant_id", "loja-a"]);
    expect(chamadas("orders", "ilike").map((c) => c.args)).toContainEqual([
      "customer_name",
      "%João%",
    ]);
    expect(await screen.findByText("Estabelecimento: Hamburgueria Central")).toBeInTheDocument();

    // Limpar volta para "Todos" e zera os resultados.
    fireEvent.click(screen.getByRole("button", { name: /Limpar/ }));
    expect(screen.getByRole("combobox", { name: "Estabelecimento" })).toHaveTextContent(
      "Todos os estabelecimentos",
    );
    expect(screen.getByText("0 pedido(s)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex: João")).toHaveValue("");
  });

  it("mostra mensagem de erro quando a busca falha", async () => {
    mocks.respostas.orders = { data: null, error: { message: "falhou" }, count: 0 };
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(
      (await screen.findAllByText("Não foi possível buscar os pedidos. Tente novamente.")).length,
    ).toBeGreaterThan(0);
  });
});

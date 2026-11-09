import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aba "Pizzaria" do cardápio. O banco e o site de pedidos são de mentira; a
 * tela e a ordem das gravações são as de verdade.
 */

const ordem: string[] = [];
const enviados: { type: string; data: Record<string, unknown> }[] = [];
let siteAceita = true;

vi.mock("@/utils/menuSync", () => ({
  syncToExternal: vi.fn(async (p: { type: string; data: Record<string, unknown> }) => {
    ordem.push(`site:${p.type}`);
    enviados.push({ type: p.type, data: p.data });
    return { success: siteAceita };
  }),
}));

const tabelas: Record<string, unknown[]> = {
  pizzeria_pizza_sizes: [
    { id: "t1", name: "Pequena", price: 26.9, max_flavors: 1, slices: 4, active: true },
    { id: "t2", name: "Grande", price: 47.9, max_flavors: 2, slices: 8, active: true },
  ],
  menu_products: [
    {
      id: "p1",
      name: "Atum",
      price: 29.9,
      active: true,
      category_id: "esp",
      external_id: "x1",
      pizza_size_prices_cents: { pequena: 2990, grande: 5290 },
    },
  ],
  menu_extras: [],
};
const updates: { tabela: string; campos: unknown }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: tabelas[tabela] ?? [], error: null }) }),
      }),
      update: (campos: unknown) => ({
        eq: async () => {
          ordem.push(`painel:${tabela}`);
          updates.push({ tabela, campos });
          return { error: null };
        },
      }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { PizzariaPremium } from "./PizzariaPremium";

const categorias = [
  {
    id: "esp",
    name: "Pizzas Salgadas Especiais",
    description: "As da casa",
    order_index: 3,
    active: true,
    external_id: "sf_cat_esp",
    is_pizza: false,
  },
];
const loja = {
  slug: "rocketpizzaria",
  api_key: "k",
  sync_endpoint: "https://conectfly.com.br/api/menu-sync",
  site_settings: { pizza_premium: { regra: "tamanho_e_especiais" } },
};

beforeEach(() => {
  ordem.length = 0;
  enviados.length = 0;
  updates.length = 0;
  siteAceita = true;
});

describe("aba Pizzaria", () => {
  it("marcar a categoria como pizza avisa o SITE primeiro, depois grava no painel", async () => {
    render(<PizzariaPremium pizzeriaId="loja" pizzeria={loja} categories={categorias} />);
    const caixa = await screen.findByRole("checkbox", { name: /Pizzas Salgadas Especiais/ });
    await userEvent.click(caixa);
    await waitFor(() => expect(ordem).toEqual(["site:category", "painel:menu_categories"]));
    expect(enviados[0].data).toMatchObject({
      name: "Pizzas Salgadas Especiais",
      description: "As da casa",
      external_id: "sf_cat_esp",
      is_pizza: true,
    });
    expect(updates[0]).toEqual({ tabela: "menu_categories", campos: { is_pizza: true } });
  });

  it("se o site recusar, o painel não marca (os dois continuam iguais)", async () => {
    siteAceita = false;
    render(<PizzariaPremium pizzeriaId="loja" pizzeria={loja} categories={categorias} />);
    const caixa = await screen.findByRole("checkbox", { name: /Pizzas Salgadas Especiais/ });
    await userEvent.click(caixa);
    await waitFor(() => expect(ordem).toEqual(["site:category"]));
    expect(updates).toEqual([]);
    expect(caixa).not.toBeChecked();
  });

  it("avisa quando o preço por sabor está cadastrado mas a regra o ignora, com atalho para corrigir", async () => {
    render(
      <PizzariaPremium
        pizzeriaId="loja"
        pizzeria={loja}
        categories={[{ ...categorias[0], is_pizza: true }]}
      />,
    );
    const aviso = await screen.findByText(/ignora esses preços/);
    expect(aviso).toHaveTextContent("Atum");
    await userEvent.click(within(aviso).getByRole("button", { name: /Maior preço/ }));
    await waitFor(() => expect(screen.queryByText(/ignora esses preços/)).not.toBeInTheDocument());
  });

  it("Publicar regras também reenvia ao site quais categorias são de pizza (conserta lojas antigas)", async () => {
    render(
      <PizzariaPremium
        pizzeriaId="loja"
        pizzeria={{ ...loja, site_settings: { pizza_premium: { regra: "maior_preco" } } }}
        categories={[{ ...categorias[0], is_pizza: true }]}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Publicar regras/ }));
    await waitFor(() => expect(ordem.slice(0, 2)).toEqual(["site:category", "site:restaurant"]));
    expect(enviados[0].data.is_pizza).toBe(true);
  });
});

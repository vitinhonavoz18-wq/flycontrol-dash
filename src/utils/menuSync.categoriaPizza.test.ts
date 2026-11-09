import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncToExternal } from "./menuSync";

/**
 * "É categoria de pizza" precisa chegar ao site. Sem isso o site não abre o
 * montador (tamanho → sabores → borda) e mostra cada sabor como produto
 * solto, com um preço só — o defeito encontrado na rocketpizzaria em
 * 09/11/2026.
 */

const ENDPOINT = "https://conectfly.com.br/api/menu-sync";

async function enviarCategoria(data: Record<string, unknown>) {
  await syncToExternal({
    type: "category",
    action: "update",
    externalId: "sf_cat_8efebec2-c2a2-4db0-9cb1-e4e14f7cf96f",
    pizzeriaSlug: "rocketpizzaria",
    pizzeriaApiKey: "k",
    syncEndpoint: ENDPOINT,
    data: {
      name: "Pizzas Salgadas Especiais",
      description: "As da casa",
      order_index: 3,
      active: true,
      ...data,
    },
  });
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  return { url, body: JSON.parse(String(init?.body)) };
}

describe("categoria de pizza chega ao site", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("marcar como pizza envia is_pizza: true, junto com a ficha completa", async () => {
    const { url, body } = await enviarCategoria({ is_pizza: true });
    expect(url).toBe(`${ENDPOINT}/category/8efebec2-c2a2-4db0-9cb1-e4e14f7cf96f`);
    expect(body).toMatchObject({
      name: "Pizzas Salgadas Especiais",
      description: "As da casa",
      sort_order: 3,
      active: true,
      is_pizza: true,
    });
  });

  it("desmarcar envia is_pizza: false (o site volta a listar como produto)", async () => {
    const { body } = await enviarCategoria({ is_pizza: false });
    expect(body.is_pizza).toBe(false);
  });

  it("o salvar comum de categoria (sem a informação) não mexe na marcação do site", async () => {
    const { body } = await enviarCategoria({});
    expect("is_pizza" in body).toBe(false);
  });
});

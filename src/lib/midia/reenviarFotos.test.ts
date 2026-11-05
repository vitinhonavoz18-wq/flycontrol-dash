import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Reenviar fotos". O banco e o site de pedidos são de mentira; a montagem
 * do que vai para o site é a de verdade.
 */

const FOTO = (n: string) =>
  `https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/${n}.webp?token=t`;

const tabelas: Record<string, unknown[]> = {};
let loja: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: () => ({
        eq: () => {
          const lista = Promise.resolve({ data: tabelas[tabela] ?? [], error: null });
          return Object.assign(lista, {
            single: async () => ({ data: loja, error: loja ? null : { message: "x" } }),
          });
        },
      }),
    }),
  },
}));

const enviados: { type: string; data: Record<string, unknown> }[] = [];
let falharNome: string | null = null;
vi.mock("@/utils/menuSync", () => ({
  syncToExternal: vi.fn(async (p: { type: string; data: Record<string, unknown> }) => {
    enviados.push({ type: p.type, data: p.data });
    return { success: p.data?.name !== falharNome };
  }),
}));

import { fotoMuda, montarReenvio, reenviarTarefas } from "./reenviarFotos";

beforeEach(() => {
  enviados.length = 0;
  falharNome = null;
  loja = {
    id: "loja",
    slug: "ze",
    api_key: "k",
    sync_endpoint: "https://conectfly.com.br/api/menu-sync",
    logo_url: FOTO("logo"),
    hero_image_url: null,
    hero_video_url: "https://outro-lugar.com/video.mp4",
  };
  tabelas.menu_categories = [
    {
      id: "c1",
      external_id: "sf_cat_abc",
      name: "Pizzas",
      description: "As melhores",
      image_url: FOTO("c1"),
      order_index: 0,
      active: true,
    },
    { id: "c2", external_id: "def", name: "Sem foto", image_url: null, active: true },
  ];
  tabelas.menu_products = [
    {
      id: "p1",
      external_id: "x1",
      name: "Calabresa",
      description: "d",
      price: 40,
      image_url: FOTO("p1"),
      active: false,
      category_id: "c1",
      product_type: "standard",
      max_extras: 2,
    },
    {
      id: "p2",
      external_id: "x2",
      name: "Órfão",
      price: 10,
      image_url: FOTO("p2"),
      category_id: "nao-existe",
      product_type: "standard",
    },
    {
      id: "p3",
      external_id: null,
      name: "Nunca foi ao site",
      image_url: FOTO("p3"),
      product_type: "standard",
    },
  ];
  tabelas.combos = [
    {
      id: "cb1",
      external_id: "y1",
      name: "Combo casal",
      combo_price: 70,
      image_url: FOTO("cb1"),
      active: true,
      combo_items: [{ product_name: "Pizza G", quantity: 1 }],
    },
  ];
});

describe("reenviar fotos", () => {
  it("só reconhece como 'muda' a foto que é nossa", () => {
    expect(fotoMuda(FOTO("a"))).toBe(true);
    expect(fotoMuda("https://outro-lugar.com/a.png")).toBe(false);
    expect(fotoMuda(null)).toBe(false);
  });

  it("reenvia só o que tem foto nossa e já está no site", async () => {
    const { tarefas } = await montarReenvio("loja");
    expect(tarefas.map((t) => t.nome)).toEqual([
      "Logo, capa e vídeo da loja",
      'Categoria "Pizzas"',
      'Produto "Calabresa"',
      'Produto "Órfão"',
      'Combo "Combo casal"',
    ]);
  });

  it("da loja, vai só o campo que muda — nada de apagar capa ou vídeo", async () => {
    const { tarefas } = await montarReenvio("loja");
    await tarefas[0].enviar();
    expect(enviados[0]).toEqual({ type: "restaurant", data: { logo_url: FOTO("logo") } });
  });

  it("produto vai com os dados completos, inclusive desligado continua desligado", async () => {
    const { tarefas } = await montarReenvio("loja");
    await tarefas[2].enviar();
    expect(enviados[0].data).toMatchObject({
      name: "Calabresa",
      price: 40,
      active: false,
      max_extras: 2,
      external_category_id: "abc",
    });
  });

  it("combo leva os itens junto, senão o site apagaria o conteúdo do combo", async () => {
    const { tarefas } = await montarReenvio("loja");
    await tarefas[4].enviar();
    expect(enviados[0].data.items).toEqual([{ product_name: "Pizza G", quantity: 1 }]);
  });

  it("conta o que foi e o que falhou, sem parar no meio", async () => {
    falharNome = "Pizzas";
    const { tarefas } = await montarReenvio("loja");
    const r = await reenviarTarefas(tarefas);
    // "Órfão" falha por não ter categoria no site; "Pizzas" falha no site.
    expect(r.enviados).toBe(3);
    expect(r.falhas).toBe(2);
    expect(r.itensComFalha).toEqual(
      expect.arrayContaining(['Categoria "Pizzas"', 'Produto "Órfão"']),
    );
  });

  it("avisa quando a loja não tem o site conectado", async () => {
    loja = { ...loja, sync_endpoint: null };
    const r = await montarReenvio("loja");
    expect(r.tarefas).toHaveLength(0);
    expect(r.erro).toMatch(/não está conectado/);
  });
});

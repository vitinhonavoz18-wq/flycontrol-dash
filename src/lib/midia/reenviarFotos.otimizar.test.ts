import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Reenviar fotos" com a opção de encolher as fotos pesadas. O banco, o site
 * de pedidos, a compressão e o envio do arquivo são de mentira; a decisão de
 * o que encolher, a ordem (site primeiro, painel depois) e o que vai para o
 * site são os de verdade.
 */

const FOTO = (n: string) =>
  `https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/${n}.webp?token=t`;
const DE_FORA = (n: string) =>
  `https://watjejwgtieqfkpebkfz.supabase.co/storage/v1/object/public/logos/${n}.png`;
const NOVA = (n: string) =>
  `https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/otimizadas/${n}.webp?token=novo`;

const KB = 1024;
const tabelas: Record<string, unknown[]> = {};
let loja: Record<string, unknown> | null = null;
const gravadosNoPainel: { tabela: string; campos: unknown; id: string }[] = [];

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
      update: (campos: unknown) => ({
        eq: async (_coluna: string, id: string) => {
          gravadosNoPainel.push({ tabela, campos, id });
          return { error: null };
        },
      }),
    }),
  },
}));

const enviados: { type: string; data: Record<string, unknown> }[] = [];
let siteRecusa = false;
vi.mock("@/utils/menuSync", () => ({
  syncToExternal: vi.fn(async (p: { type: string; data: Record<string, unknown> }) => {
    enviados.push({ type: p.type, data: p.data });
    return { success: !siteRecusa };
  }),
}));

let contadorDeNovas = 0;
const enviarFoto = vi.fn(async () => NOVA(`n${++contadorDeNovas}`));
vi.mock("@/lib/imagem/enviarFoto", () => ({ enviarFotoDoCardapio: () => enviarFoto() }));

/** A "compressão" devolve um arquivo menor — ou o mesmo, se `naoMelhora`. */
let naoMelhora = false;
const comprimir = vi.fn(async (b: Blob, limite: number) =>
  naoMelhora ? b : new Blob([new Uint8Array(10)], { type: `image/webp;l=${limite}` }),
);
vi.mock("@/lib/imagem/comprimir", () => ({
  LIMITE_PRODUTO: 900,
  comprimirParaWebp: (b: Blob, limite: number) => comprimir(b, limite),
}));

/** Peso de cada endereço, como o servidor responderia ao "cabeçalho". */
const pesos = new Map<string, number>();

import { montarReenvio, reenviarTarefas } from "./reenviarFotos";

beforeEach(() => {
  enviados.length = 0;
  gravadosNoPainel.length = 0;
  siteRecusa = false;
  naoMelhora = false;
  contadorDeNovas = 0;
  pesos.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const peso = pesos.get(url);
      if (peso === undefined) return new Response(null, { status: 404 });
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-length": String(peso) } });
      }
      return new Response(new Uint8Array(peso), { status: 200 });
    }),
  );

  loja = {
    id: "loja",
    slug: "ze",
    api_key: "k",
    sync_endpoint: "https://conectfly.com.br/api/menu-sync",
    logo_url: DE_FORA("logo"),
    hero_image_url: FOTO("capa"),
    hero_video_url: FOTO("video"),
  };
  tabelas.menu_categories = [
    { id: "c1", external_id: "sf_cat_abc", name: "Pizzas", image_url: null, active: true },
  ];
  tabelas.menu_products = [
    {
      id: "p1",
      external_id: "x1",
      name: "Calabresa",
      price: 40,
      image_url: DE_FORA("calabresa"),
      active: true,
      category_id: "c1",
      product_type: "standard",
    },
    {
      id: "p2",
      external_id: "x2",
      name: "Leve de fora",
      price: 30,
      image_url: DE_FORA("leve"),
      active: true,
      category_id: "c1",
      product_type: "standard",
    },
  ];
  tabelas.combos = [];

  pesos.set(DE_FORA("logo"), 2600 * KB); // logo de 2,6 MB: pesada
  pesos.set(FOTO("capa"), 500 * KB); // capa de 500 KB: dentro do aceitável
  pesos.set(FOTO("video"), 18 * 1024 * KB); // vídeo de 18 MB
  pesos.set(DE_FORA("calabresa"), 1900 * KB); // foto de 1,9 MB: pesada
  pesos.set(DE_FORA("leve"), 80 * KB); // foto leve, de outro lugar: não mexe
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reenviar fotos — encolher as pesadas", () => {
  it("sem a opção, nada é medido nem encolhido (o botão antigo continua igual)", async () => {
    const { tarefas, pesadas } = await montarReenvio("loja");
    expect(pesadas).toBe(0);
    // Só a capa e o vídeo, que mudam de endereço; as fotos de fora ficam.
    expect(tarefas.map((t) => t.nome)).toEqual(["Logo, capa e vídeo da loja"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("acha as fotos pesadas, mesmo as que estão fora do nosso Supabase", async () => {
    const { tarefas, pesadas } = await montarReenvio("loja", { otimizar: true });
    expect(pesadas).toBe(2);
    expect(tarefas.map((t) => t.nome)).toEqual([
      "Logo, capa e vídeo da loja",
      'Produto "Calabresa"',
    ]);
  });

  it("avisa do vídeo pesado, com o peso em linguagem do lojista", async () => {
    const { avisos } = await montarReenvio("loja", { otimizar: true });
    expect(avisos).toHaveLength(1);
    expect(avisos![0]).toMatch(/18,0 MB/);
    expect(avisos![0]).toMatch(/até 5 MB/);
  });

  it("logo encolhida vai com o endereço novo; capa leve e vídeo só mudam de caminho", async () => {
    const { tarefas } = await montarReenvio("loja", { otimizar: true });
    await tarefas[0].enviar();
    expect(comprimir).toHaveBeenCalledTimes(1);
    expect(comprimir.mock.calls[0][1]).toBe(1200); // régua da logo, não a do produto
    expect(enviados[0]).toEqual({
      type: "restaurant",
      data: { logo_url: NOVA("n1"), hero_image_url: FOTO("capa"), hero_video_url: FOTO("video") },
    });
    // No painel, só a logo troca (capa e vídeo continuam com o endereço original).
    expect(gravadosNoPainel).toEqual([
      { tabela: "pizzerias", id: "loja", campos: { logo_url: NOVA("n1") } },
    ]);
  });

  it("produto encolhido: site recebe a foto nova com os dados completos, painel grava depois", async () => {
    const { tarefas } = await montarReenvio("loja", { otimizar: true });
    const ok = await tarefas[1].enviar();
    expect(ok).toBe(true);
    expect(comprimir.mock.calls[0][1]).toBe(900);
    expect(enviados[0].data).toMatchObject({
      name: "Calabresa",
      price: 40,
      image_url: NOVA("n1"),
      external_category_id: "abc",
    });
    expect(gravadosNoPainel).toEqual([
      { tabela: "menu_products", id: "p1", campos: { image_url: NOVA("n1") } },
    ]);
  });

  it("se o site recusar, o painel NÃO troca a foto (os dois continuam iguais)", async () => {
    siteRecusa = true;
    const { tarefas } = await montarReenvio("loja", { otimizar: true });
    const r = await reenviarTarefas(tarefas);
    expect(r.falhas).toBe(2);
    expect(gravadosNoPainel).toEqual([]);
  });

  it("se a foto não ficar mais leve, nada de arquivo novo nem troca no painel", async () => {
    naoMelhora = true;
    const { tarefas } = await montarReenvio("loja", { otimizar: true });
    await tarefas[1].enviar();
    expect(enviarFoto).not.toHaveBeenCalled();
    expect(enviados[0].data.image_url).toBe(DE_FORA("calabresa"));
    expect(gravadosNoPainel).toEqual([]);
  });

  it("servidor que não informa o peso: a foto fica como está", async () => {
    pesos.delete(DE_FORA("calabresa"));
    const { tarefas, pesadas } = await montarReenvio("loja", { otimizar: true });
    expect(pesadas).toBe(1);
    expect(tarefas.map((t) => t.nome)).toEqual(["Logo, capa e vídeo da loja"]);
  });
});

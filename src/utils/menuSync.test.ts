import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncToExternal } from "./menuSync";

const REST_ENDPOINT = "https://conectfly.com.br/api/public/menu-sync/minha-loja/tok123";

describe("syncToExternal — restaurant (loja)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: { id: "r1" } }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("atualiza a loja sem exigir externalId (SiteCreatorFly resolve pela API key)", async () => {
    const result = await syncToExternal({
      type: "restaurant",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: { description: "A melhor pizza da região" },
    });

    expect(result.success).toBe(true);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    // Sem segmento de ID: PUT .../api/menu-sync/restaurant, não .../restaurant/undefined
    expect(url).toBe("https://conectfly.com.br/api/menu-sync/restaurant");
    expect(init?.method).toBe("PUT");
  });

  it("traduz opening_hours do FlyControl para hours, que é o nome usado no SiteCreatorFly", async () => {
    await syncToExternal({
      type: "restaurant",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: { opening_hours: "Seg a Sex: 18h às 23h", logo_url: "https://x/logo.png" },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.hours).toBe("Seg a Sex: 18h às 23h");
    expect(body.logo_url).toBe("https://x/logo.png");
  });

  it("envia a mídia do hero (imagem ou vídeo de capa) com os mesmos nomes que o SiteCreatorFly espera", async () => {
    await syncToExternal({
      type: "restaurant",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: {
        hero_media_type: "video",
        hero_video_url: "https://x/hero.mp4",
        hero_image_url: "https://x/hero.jpg",
      },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.hero_media_type).toBe("video");
    expect(body.hero_video_url).toBe("https://x/hero.mp4");
    expect(body.hero_image_url).toBe("https://x/hero.jpg");
  });

  it("envia identidade, contato e modos de atendimento com os nomes que o SiteCreatorFly espera (phone vira whatsapp_number)", async () => {
    await syncToExternal({
      type: "restaurant",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: {
        business_type: "Hamburgueria",
        tagline: "O melhor burger da região",
        city: "Salvador, BA",
        address: "Rua Teste, 123",
        phone: "5571986182819",
        whatsapp_display: "(71) 98618-2819",
        delivery_enabled: true,
        pickup_enabled: false,
        table_enabled: true,
      },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.business_type).toBe("Hamburgueria");
    expect(body.tagline).toBe("O melhor burger da região");
    expect(body.city).toBe("Salvador, BA");
    expect(body.address).toBe("Rua Teste, 123");
    expect(body.whatsapp_number).toBe("5571986182819");
    expect(body.whatsapp_display).toBe("(71) 98618-2819");
    expect(body.delivery_enabled).toBe(true);
    expect(body.pickup_enabled).toBe(false);
    expect(body.table_enabled).toBe(true);
    // "phone" não é um nome que o SiteCreatorFly reconhece — só whatsapp_number deve ir.
    expect(body.phone).toBeUndefined();
  });

  it("envia aparência (modelo, cores, fotos) e comportamento do cardápio (site_settings)", async () => {
    await syncToExternal({
      type: "restaurant",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: {
        selected_template: "burger_style",
        primary_color: "35 100% 43%",
        secondary_color: "0 0% 100%",
        show_item_images: false,
        site_settings: { entry_mode: "cards", show_cart_button: false },
      },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.selected_template).toBe("burger_style");
    expect(body.primary_color).toBe("35 100% 43%");
    expect(body.secondary_color).toBe("0 0% 100%");
    expect(body.show_item_images).toBe(false);
    // site_settings vai como veio — quem mescla com o resto é o
    // SiteCreatorFly (mergeJsonbSettings), não o FlyControl.
    expect(body.site_settings).toEqual({ entry_mode: "cards", show_cart_button: false });
  });

  it("continua exigindo externalId para atualizar um produto (não é a loja)", async () => {
    const result = await syncToExternal({
      type: "product",
      action: "update",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data: { name: "Margherita" },
    });

    expect(result).toEqual({ success: false, error: "missing_external_id" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * Criar combo falhava com "Could not find the 'available_days' column of
 * 'combos'". A causa estava no banco do SiteCreatorFly, que não tinha onde
 * guardar os campos enviados (corrigido em
 * docs/sitecreatorfly-combos-aplicar-no-supabase.sql).
 *
 * Estes testes existem para impedir a "correção" errada: renomear os campos
 * aqui para os nomes das colunas do site (price, is_active, is_highlighted).
 * Quem traduz é a API do SiteCreatorFly — é assim que produto e categoria
 * sincronizam hoje. Mandar o nome final daqui quebraria a integração inteira.
 */
describe("syncToExternal — combo", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "c1" }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function criarCombo(data: Record<string, unknown>) {
    await syncToExternal({
      type: "combo",
      action: "create",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "chave-123",
      syncEndpoint: REST_ENDPOINT,
      data,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    return JSON.parse(init?.body as string);
  }

  it("envia preço, ativo e destaque com os nomes que a API do site espera receber", async () => {
    const body = await criarCombo({
      name: "Combo Família",
      combo_price: 50,
      original_price: 90,
      active: true,
      highlight: true,
    });

    expect(body.combo_price).toBe(50);
    expect(body.original_price).toBe(90);
    expect(body.active).toBe(true);
    expect(body.highlight).toBe(true);

    // Os nomes das colunas do site não podem aparecer aqui: quem converte
    // para eles é o outro lado.
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("is_active");
    expect(body).not.toHaveProperty("is_highlighted");
  });

  it("leva descrição, foto, dias e horários — os campos que o site não guardava", async () => {
    const body = await criarCombo({
      name: "Combo Fim de Semana",
      combo_price: 50,
      description: "Só sexta a domingo",
      image_url: "https://x/combo.png",
      available_days: ["sex", "sab", "dom"],
      start_time: "18:00",
      end_time: "23:00",
    });

    expect(body.description).toBe("Só sexta a domingo");
    expect(body.image_url).toBe("https://x/combo.png");
    expect(body.available_days).toEqual(["sex", "sab", "dom"]);
    expect(body.start_time).toBe("18:00");
    expect(body.end_time).toBe("23:00");
  });

  it("repassa os itens como o painel monta, sem reformatar", async () => {
    const items = [
      { product_name: "Pizza Grande", quantity: 2, product_type: "pizza" },
      { product_name: "Refrigerante 2L", quantity: 1, product_type: "beverage" },
    ];

    const body = await criarCombo({ name: "Combo Casal", combo_price: 50, items });

    expect(body.items).toEqual(items);
  });

  it("mantém o combo ativo quando o painel não diz nada sobre isso", async () => {
    const body = await criarCombo({ name: "Combo", combo_price: 50 });
    expect(body.active).toBe(true);
  });
});

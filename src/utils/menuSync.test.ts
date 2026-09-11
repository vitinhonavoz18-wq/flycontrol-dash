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

describe("syncToExternal — delivery_zone (bairro e taxa)", () => {
  let chamadas: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    chamadas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        chamadas.push({ url, init });
        // O cabeçalho não é enfeite: o `syncToExternal` só abre o pacote da
        // resposta quando ela se identifica como JSON — que é o que o
        // SiteCreatorFly manda de verdade (ver o helper `json` do menu-sync).
        // Sem ele, o id da zona voltaria vazio e a próxima edição criaria uma
        // zona duplicada em vez de corrigir a existente.
        return new Response(JSON.stringify({ success: true, data: { id: "zona-sf-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // O SiteCreatorFly usa /delivery-zone (com hífen) na URL. Escrever
  // delivery_zone lá daria 400 e a taxa nunca chegaria no cardápio.
  it("usa o endereço com hífen que o SiteCreatorFly espera", async () => {
    await syncToExternal({
      type: "delivery_zone",
      action: "create",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "fc_key",
      syncEndpoint: REST_ENDPOINT,
      data: { neighborhood: "Centro", fee: 5.5, sort_order: 0 },
    });

    expect(chamadas[0].url).toBe("https://conectfly.com.br/api/menu-sync/delivery-zone");
    expect(chamadas[0].init.method).toBe("POST");
  });

  // Os três campos precisam chegar com o MESMO nome. O outro lado grava só o
  // que reconhece pelo nome exato: renomear qualquer um faz a taxa chegar em
  // branco e o cliente vê "a combinar" no lugar do preço.
  it("manda bairro, taxa e ordem com os nomes que o outro lado reconhece", async () => {
    await syncToExternal({
      type: "delivery_zone",
      action: "create",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "fc_key",
      syncEndpoint: REST_ENDPOINT,
      data: { neighborhood: "Jardins", fee: 8, sort_order: 2 },
    });

    expect(JSON.parse(chamadas[0].init.body as string)).toEqual({
      neighborhood: "Jardins",
      fee: 8,
      sort_order: 2,
    });
  });

  it("devolve o id que o SiteCreatorFly deu, para a edição achar a linha depois", async () => {
    const r = await syncToExternal({
      type: "delivery_zone",
      action: "create",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "fc_key",
      syncEndpoint: REST_ENDPOINT,
      data: { neighborhood: "Centro", fee: 5, sort_order: 0 },
    });

    expect(r.success).toBe(true);
    expect(r.externalId).toBe("zona-sf-1");
  });

  it("editar aponta para a zona certa pelo id do outro lado", async () => {
    await syncToExternal({
      type: "delivery_zone",
      action: "update",
      externalId: "zona-sf-1",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "fc_key",
      syncEndpoint: REST_ENDPOINT,
      data: { neighborhood: "Centro", fee: 7, sort_order: 0 },
    });

    expect(chamadas[0].url).toBe("https://conectfly.com.br/api/menu-sync/delivery-zone/zona-sf-1");
    expect(chamadas[0].init.method).toBe("PUT");
  });

  // Sem o id do outro lado não dá para saber QUAL bairro apagar. Apagar
  // "algum" seria tirar do ar o bairro errado — melhor recusar.
  it("não tenta apagar sem saber qual zona é", async () => {
    const r = await syncToExternal({
      type: "delivery_zone",
      action: "delete",
      pizzeriaSlug: "minha-loja",
      pizzeriaApiKey: "fc_key",
      syncEndpoint: REST_ENDPOINT,
    });

    expect(r.success).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});

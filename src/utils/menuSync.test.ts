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

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
    expect(init.method).toBe("PUT");
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
    const body = JSON.parse(init.body);
    expect(body.hours).toBe("Seg a Sex: 18h às 23h");
    expect(body.logo_url).toBe("https://x/logo.png");
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

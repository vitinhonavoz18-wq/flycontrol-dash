import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { provisionRestaurantInSF } from "./provision.server";

describe("provisionRestaurantInSF — endereço de retorno dos pedidos", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SITECREATORFLY_BASE_URL = "https://conectfly.com.br";
    process.env.SITECREATORFLY_INTERNAL_TOKEN = "segredo-teste";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, restaurant_id: "r1" }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("inclui flycontrol_base_url no envio quando FLYCONTROL_PUBLIC_URL está configurado", async () => {
    process.env.FLYCONTROL_PUBLIC_URL = "https://flycontrol.conectfly.com.br/";

    await provisionRestaurantInSF({
      flycontrol_id: "pz-1",
      name: "Pizzaria Teste",
      slug: "pizzaria-teste",
      owner_name: "Fulano",
      business_type: "pizzaria",
      selected_template: "black",
      api_key: "chave-123",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    // Sem a barra final — mesmo padrão usado para SITECREATORFLY_BASE_URL.
    expect(body.flycontrol_base_url).toBe("https://flycontrol.conectfly.com.br");
  });

  it("não inclui flycontrol_base_url quando FLYCONTROL_PUBLIC_URL não está configurado", async () => {
    delete process.env.FLYCONTROL_PUBLIC_URL;

    await provisionRestaurantInSF({
      flycontrol_id: "pz-2",
      name: "Pizzaria Sem Endereço",
      slug: "pizzaria-sem-endereco",
      owner_name: "Fulano",
      business_type: "pizzaria",
      selected_template: "black",
      api_key: "chave-456",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.flycontrol_base_url).toBeUndefined();
  });
});

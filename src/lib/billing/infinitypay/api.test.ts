import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkInfinityPayPayment, createInfinityPayCheckoutLink, infinityPayHandle } from "./api";

describe("infinityPayHandle", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("vazio sem a variável", () => {
    delete process.env.INFINITYPAY_HANDLE;
    expect(infinityPayHandle()).toBeNull();
  });

  it("remove o '$' do começo, se alguém colar a InfiniteTag com ele", () => {
    process.env.INFINITYPAY_HANDLE = "$minha_loja";
    expect(infinityPayHandle()).toBe("minha_loja");
  });

  it("apara espaços", () => {
    process.env.INFINITYPAY_HANDLE = "  minha_loja  ";
    expect(infinityPayHandle()).toBe("minha_loja");
  });
});

describe("createInfinityPayCheckoutLink", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INFINITYPAY_HANDLE = "minha_loja";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("recusa sem handle configurado, sem tentar rede", async () => {
    delete process.env.INFINITYPAY_HANDLE;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await createInfinityPayCheckoutLink({
      orderNsu: "intent-1",
      amountCents: 1000,
      description: "teste",
      redirectUrl: "https://app.exemplo/pagamento/premium",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    expect(result).toEqual({ ok: false, error: "missing_handle" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia preço em centavos, order_nsu e as duas URLs no corpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ url: "https://checkout.infinitepay.io/x" }))),
    );

    await createInfinityPayCheckoutLink({
      orderNsu: "intent-1",
      amountCents: 37_500,
      description: "FlyControl - plano PREMIUM",
      redirectUrl: "https://app.exemplo/pagamento/premium",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    const body = JSON.parse(init?.body as string);
    expect(body.handle).toBe("minha_loja");
    expect(body.order_nsu).toBe("intent-1");
    expect(body.redirect_url).toBe("https://app.exemplo/pagamento/premium");
    expect(body.webhook_url).toBe("https://app.exemplo/api/webhooks/infinitypay");
    expect(body.items).toEqual([
      { quantity: 1, price: 37_500, description: "FlyControl - plano PREMIUM" },
    ]);
  });

  it("lê a URL do link mesmo que o campo se chame diferente do esperado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ checkout_url: "https://checkout.infinitepay.io/y" })),
      ),
    );

    const result = await createInfinityPayCheckoutLink({
      orderNsu: "intent-2",
      amountCents: 1000,
      description: "teste",
      redirectUrl: "https://app.exemplo/pagamento/cents",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    expect(result).toEqual({ ok: true, url: "https://checkout.infinitepay.io/y" });
  });

  it("erro claro quando a resposta não tem nenhum campo de URL reconhecido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "created" }))),
    );

    const result = await createInfinityPayCheckoutLink({
      orderNsu: "intent-3",
      amountCents: 1000,
      description: "teste",
      redirectUrl: "https://app.exemplo/pagamento/cents",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    expect(result).toEqual({ ok: false, error: "infinitypay_missing_url_in_response" });
  });

  it("propaga o código HTTP em caso de erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro interno", { status: 500 })),
    );

    const result = await createInfinityPayCheckoutLink({
      orderNsu: "intent-4",
      amountCents: 1000,
      description: "teste",
      redirectUrl: "https://app.exemplo/pagamento/cents",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    expect(result).toEqual({ ok: false, error: "infinitypay_http_500" });
  });

  it("inclui o motivo da InfinityPay quando o erro vem em JSON", async () => {
    // A InfinityPay responde erro como {success:false, message:"..."} — sem
    // ler esse campo, o log fica só com o código HTTP e nada mais.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              message: "param is missing or the value is empty or invalid: handle",
            }),
            { status: 400 },
          ),
      ),
    );

    const result = await createInfinityPayCheckoutLink({
      orderNsu: "intent-5",
      amountCents: 1000,
      description: "teste",
      redirectUrl: "https://app.exemplo/pagamento/cents",
      webhookUrl: "https://app.exemplo/api/webhooks/infinitypay",
    });

    expect(result).toEqual({
      ok: false,
      error: "infinitypay_http_400: param is missing or the value is empty or invalid: handle",
    });
  });
});

describe("checkInfinityPayPayment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INFINITYPAY_HANDLE = "minha_loja";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("recusa sem handle configurado", async () => {
    delete process.env.INFINITYPAY_HANDLE;
    const result = await checkInfinityPayPayment({ orderNsu: "intent-1" });
    expect(result).toEqual({ ok: false, error: "missing_handle" });
  });

  it("interpreta pagamento confirmado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              paid: true,
              amount: 1000,
              paid_amount: 1010,
              capture_method: "pix",
            }),
          ),
      ),
    );

    const result = await checkInfinityPayPayment({ orderNsu: "intent-1", transactionNsu: "tx-1" });
    expect(result).toEqual({ ok: true, paid: true, paidAmountCents: 1010, captureMethod: "pix" });
  });

  it("interpreta pagamento ainda não confirmado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true, paid: false, amount: 1000 }))),
    );

    const result = await checkInfinityPayPayment({ orderNsu: "intent-1" });
    expect(result.ok && result.paid).toBe(false);
  });

  it("propaga falha explícita da InfinityPay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, message: "Pedido não encontrado" })),
      ),
    );

    const result = await checkInfinityPayPayment({ orderNsu: "intent-inexistente" });
    expect(result).toEqual({ ok: false, error: "Pedido não encontrado" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A porta de entrada do servidor. O sistema de páginas (TanStack Start) é de
 * mentira e registra se foi chamado; o atalho das fotos é o de verdade.
 */

const sistemaDePaginas = vi.fn(async () => new Response("página", { status: 200 }));
vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: sistemaDePaginas },
}));
vi.mock("./lib/billing/dailyCron", () => ({ runDailyBillingCron: vi.fn() }));

import servidor from "./server";

const FOTO =
  "https://flycontrol.conectfly.com.br/api/public/midia/knhenchgntttraaeewlj/sign/menu-images/p/1.webp?token=abc";

afterEach(() => {
  vi.unstubAllGlobals();
  sistemaDePaginas.mockClear();
});

describe("porta de entrada do servidor", () => {
  it("foto do cardápio é entregue sem montar o sistema de páginas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bytes", { headers: { "content-type": "image/webp" } })),
    );
    const r = await servidor.fetch(new Request(FOTO), {}, {});
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toMatch(/immutable/);
    expect(sistemaDePaginas).not.toHaveBeenCalled();
  });

  it("foto de gaveta particular continua recusada pelo atalho", async () => {
    const r = await servidor.fetch(
      new Request(
        "https://flycontrol.conectfly.com.br/api/public/midia/knhenchgntttraaeewlj/sign/crm-chat-media/a.ogg?token=x",
      ),
      {},
      {},
    );
    expect(r.status).toBe(404);
    expect(sistemaDePaginas).not.toHaveBeenCalled();
  });

  it("qualquer outra página segue o caminho normal", async () => {
    const r = await servidor.fetch(
      new Request("https://flycontrol.conectfly.com.br/login"),
      {},
      {},
    );
    expect(await r.text()).toBe("página");
    expect(sistemaDePaginas).toHaveBeenCalledTimes(1);
  });

  it("envio (POST) para o endereço de fotos não usa o atalho", async () => {
    await servidor.fetch(new Request(FOTO, { method: "POST", body: "x" }), {}, {});
    expect(sistemaDePaginas).toHaveBeenCalledTimes(1);
  });
});

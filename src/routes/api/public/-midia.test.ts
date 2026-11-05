import { afterEach, describe, expect, it, vi } from "vitest";
import { entregar } from "./midia.$";

/**
 * A "geladeira" das fotos (/api/public/midia/...). O Supabase e o cache do
 * Cloudflare são de mentira; a rota é a de verdade.
 */

const BASE = "https://flycontrol.conectfly.com.br/api/public/midia";
const FOTO = `${BASE}/knhenchgntttraaeewlj/sign/menu-images/p/1.webp?token=abc`;

function cacheDeMentira() {
  const guardados = new Map<string, Response>();
  return {
    guardados,
    match: vi.fn(async (req: Request) => guardados.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      guardados.set(req.url, res);
    }),
  };
}

function instalarCache() {
  const cache = cacheDeMentira();
  vi.stubGlobal("caches", { default: cache });
  return cache;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/public/midia", () => {
  it("recusa o que não é foto nossa, sem nem ir ao Supabase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await entregar(new Request(`${BASE}/aaaaaaaaaaaaaaaaaaaa/public/menu-images/a.png`));
    expect(r.status).toBe(404);
    const chat = await entregar(
      new Request(`${BASE}/knhenchgntttraaeewlj/sign/crm-chat-media/a.png?token=t`),
    );
    expect(chat.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("busca no Supabase só na primeira visita; a segunda sai do cache", async () => {
    const cache = instalarCache();
    const fetchMock = vi.fn(
      async () =>
        new Response("bytes-da-foto", { status: 200, headers: { "content-type": "image/webp" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const primeira = await entregar(new Request(FOTO));
    expect(primeira.status).toBe(200);
    expect(await primeira.text()).toBe("bytes-da-foto");
    expect(primeira.headers.get("cache-control")).toContain("max-age=31536000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/p/1.webp?token=abc",
    );

    // Mesmo arquivo, com um parâmetro a mais: mesma cópia guardada.
    const segunda = await entregar(new Request(`${FOTO}&v=2`));
    expect(segunda.status).toBe(200);
    expect(await segunda.text()).toBe("bytes-da-foto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("não guarda erro: se o Supabase falhar, a próxima visita tenta de novo", async () => {
    const cache = instalarCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("restricted", { status: 402 })),
    );
    const r = await entregar(new Request(FOTO));
    expect(r.status).toBe(502);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("não abre página da internet disfarçada de foto com o nosso endereço", async () => {
    instalarCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<script>alert(1)</script>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    expect((await entregar(new Request(FOTO))).status).toBe(415);
  });

  it("funciona mesmo sem cache disponível (entrega direto)", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("v", { status: 200, headers: { "content-type": "video/mp4" } }),
      ),
    );
    const r = await entregar(new Request(FOTO));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("video/mp4");
  });
});

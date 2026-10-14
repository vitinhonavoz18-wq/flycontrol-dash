import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portaria do campo "Endereço da loja" (/api/pizzerias/$id/address).
 *
 * Roda a rota de verdade, com a conferência de dono de verdade
 * (requireOwnerOrAdmin). Só o banco, o login e o SiteCreatorFly são de
 * mentira.
 */

const lojas: Record<string, { id: string; owner_id: string; api_key: string }> = {
  "loja-do-ze": { id: "loja-do-ze", owner_id: "ze", api_key: "chave-ze" },
  "loja-da-ana": { id: "loja-da-ana", owner_id: "ana", api_key: "chave-ana" },
};
const gravacoes: { id: string; patch: Record<string, unknown> }[] = [];
let admins: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const filtros: Record<string, string> = {};
      let patch: Record<string, unknown> | null = null;
      const q: any = {
        select: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        eq: (col: string, val: string) => {
          filtros[col] = val;
          if (patch) {
            gravacoes.push({ id: val, patch });
            return Promise.resolve({ error: null });
          }
          return q;
        },
        maybeSingle: async () => ({ data: lojas[filtros.id] ?? null, error: null }),
      };
      return q;
    },
  },
}));

// O "login": o token é o próprio nome do usuário.
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, opts: any) => {
    const token = String(opts?.global?.headers?.Authorization ?? "").replace("Bearer ", "");
    return {
      auth: {
        getClaims: async () =>
          token ? { data: { claims: { sub: token } }, error: null } : { data: null, error: {} },
      },
      rpc: async (fn: string) => ({
        data: fn === "is_admin" && admins.includes(token),
        error: null,
      }),
    };
  },
}));

const { Route } = await import("./pizzerias.$id.address");
const POST = (Route.options as any).server.handlers.POST as (ctx: {
  request: Request;
  params: { id: string };
}) => Promise<Response>;

function pedir(usuario: string | null, lojaId: string, body: unknown) {
  return POST({
    params: { id: lojaId },
    request: new Request(`http://x/api/pizzerias/${lojaId}/address`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(usuario ? { Authorization: `Bearer ${usuario}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  });
}

describe("endereço da loja — quem pode mexer", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "chave-publica";
    process.env.SITECREATORFLY_BASE_URL = "https://conectfly.com.br";
    process.env.SITECREATORFLY_INTERNAL_TOKEN = "segredo";
    gravacoes.length = 0;
    admins = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const b = JSON.parse(String(init.body));
        if (b.address === "ocupado") {
          return new Response(
            JSON.stringify({
              success: false,
              error: "taken",
              status: "taken",
              suggestions: ["ocupado-2"],
            }),
            { status: 409 },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            status: b.action === "set" ? "saved" : "available",
            address: b.address,
            suggestions: [],
            public_url: `https://conectfly.com.br/${b.address}`,
          }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
  });

  it("sem login: recusa e não fala com o site", async () => {
    const r = await pedir(null, "loja-do-ze", { action: "set", address: "ze-lanches" });
    expect(r.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dono de OUTRA loja: recusa, não fala com o site e não grava nada", async () => {
    const r = await pedir("ana", "loja-do-ze", { action: "set", address: "roubado" });
    expect(r.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(gravacoes).toHaveLength(0);
  });

  it("dono da loja: troca o endereço da PRÓPRIA loja e atualiza o link do painel", async () => {
    const r = await pedir("ze", "loja-do-ze", { action: "set", address: "ze-lanches" });
    expect(r.status).toBe(200);
    const enviado = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body));
    // A loja é a do banco, identificada pelo id DESTA loja.
    expect(enviado).toMatchObject({
      flycontrol_id: "loja-do-ze",
      api_key: "chave-ze",
      action: "set",
    });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "https://conectfly.com.br/api/internal/store-address",
    );
    expect(gravacoes).toEqual([
      { id: "loja-do-ze", patch: { public_url: "https://conectfly.com.br/ze-lanches" } },
    ]);
  });

  it("consulta de disponibilidade também exige ser o dono", async () => {
    expect((await pedir("ana", "loja-do-ze", { action: "check", address: "x-y-z" })).status).toBe(
      403,
    );
    const ok = await pedir("ze", "loja-do-ze", { action: "check", address: "x-y-z" });
    expect(await ok.json()).toMatchObject({ success: true, status: "available" });
    expect(gravacoes).toHaveLength(0);
  });

  it("administrador da plataforma pode ajudar qualquer loja", async () => {
    admins = ["suporte"];
    const r = await pedir("suporte", "loja-da-ana", { action: "set", address: "ana-doces" });
    expect(r.status).toBe(200);
    expect(gravacoes[0].id).toBe("loja-da-ana");
  });

  it("nome já em uso: devolve 409 com sugestões e não mexe no link do painel", async () => {
    const r = await pedir("ze", "loja-do-ze", { action: "set", address: "ocupado" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ status: "taken", suggestions: ["ocupado-2"] });
    expect(gravacoes).toHaveLength(0);
  });
});

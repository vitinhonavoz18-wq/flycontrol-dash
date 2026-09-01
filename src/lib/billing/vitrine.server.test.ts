import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fechar e reabrir a vitrine andam em par.
 *
 * O corte por falta de pagamento fecha o cardápio digital do cliente final.
 * Se nada reabrisse, o lojista pagaria, recuperaria o painel, os pedidos
 * voltariam a ser aceitos pela API — e o site dele continuaria fechado, sem
 * ninguém entender por quê. Foi exatamente o que aconteceu: o fechamento
 * entrou primeiro e a reabertura ficou faltando.
 *
 * Estes testes existem para o par nunca mais se separar.
 */

let loja: Record<string, unknown> | null = null;
const sincronizou = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const alvo = {
        select: () => alvo,
        eq: () => alvo,
        maybeSingle: () => Promise.resolve({ data: loja, error: null }),
      };
      return alvo;
    },
  },
}));

vi.mock("@/utils/menuSync", () => ({
  syncToExternal: (p: unknown) => sincronizou(p),
}));

const { fecharVitrine, reabrirVitrine } = await import("./vitrine.server");

const LOJA_PROVISIONADA = {
  slug: "pizzaria-teste",
  api_key: "chave",
  sync_endpoint: "https://exemplo/sync",
  sf_restaurant_id: "sf-1",
  name: "Pizzaria Teste",
  is_open: true,
};

/** O `is_open` que foi realmente empurrado para o SiteCreatorFly. */
const enviado = () => (sincronizou.mock.calls[0][0] as { data: { is_open: boolean } }).data.is_open;

beforeEach(() => {
  sincronizou.mockReset();
  sincronizou.mockResolvedValue({ success: true });
  loja = { ...LOJA_PROVISIONADA };
});

describe("fechar", () => {
  it("manda a loja fechar", async () => {
    expect(await fecharVitrine("loja-1")).toEqual({ ok: true });
    expect(enviado()).toBe(false);
  });

  it("avisa quando o SiteCreatorFly recusa", async () => {
    sincronizou.mockResolvedValue({ success: false, error: "timeout" });
    expect(await fecharVitrine("loja-1")).toEqual({ ok: false, erro: "timeout" });
  });
});

describe("reabrir", () => {
  it("devolve a loja ao ar depois do pagamento", async () => {
    expect(await reabrirVitrine("loja-1")).toEqual({ ok: true });
    expect(enviado()).toBe(true);
  });

  it("NÃO abre à força a loja que o dono deixou fechada", async () => {
    // O lojista pode estar fechado por outro motivo: fora do horário,
    // feriado, sem entregador. Reabrir no `true` fixo colocaria a loja para
    // receber pedido numa hora em que ele não quer atender — e o problema
    // teria sido criado por nós, não por ele.
    loja = { ...LOJA_PROVISIONADA, is_open: false };

    await reabrirVitrine("loja-1");

    expect(enviado()).toBe(false);
  });

  it("loja sem valor gravado é tratada como aberta", async () => {
    loja = { ...LOJA_PROVISIONADA, is_open: null };
    await reabrirVitrine("loja-1");
    expect(enviado()).toBe(true);
  });
});

describe("loja sem vitrine", () => {
  it.each([
    ["sem endpoint de sincronização", { sync_endpoint: null }],
    ["sem identificador no SiteCreatorFly", { sf_restaurant_id: null }],
    ["que não existe", null],
  ])("%s não vira erro nem chamada externa", async (_nome, patch) => {
    // Quem só usa o painel não tem cardápio digital para abrir ou fechar.
    // Tratar isso como falha encheria a auditoria de erro que não é erro.
    loja = patch === null ? null : { ...LOJA_PROVISIONADA, ...patch };

    expect(await fecharVitrine("loja-1")).toEqual({ ok: true });
    expect(await reabrirVitrine("loja-1")).toEqual({ ok: true });
    expect(sincronizou).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BUSCAR O ARQUIVO NO WHATSAPP E GUARDAR NA PASTA DA LOJA — com banco, pasta
 * e UAZAPI de mentira, para testar cada caminho sem tocar em nada real.
 *
 * O que não pode acontecer, e é testado aqui:
 *   - uma loja abrir o arquivo de uma mensagem de OUTRA loja;
 *   - o servidor baixar de um endereço que não é da UAZAPI;
 *   - guardar uma página da internet disfarçada de foto;
 *   - duas telas abertas criarem dois arquivos para a mesma mensagem;
 *   - o texto cru de erro do fornecedor chegar na tela do lojista.
 */

type Filtro = [string, string, unknown];
type Consulta = { tabela: string; op: "select" | "update"; filtros: Filtro[]; patch?: unknown };

const estado = vi.hoisted(() => ({
  mensagem: null as Record<string, unknown> | null,
  cofre: { instance_token: "token-do-aparelho" } as Record<string, unknown> | null,
  gravouCaminho: true,
  caminhoDoOutro: null as string | null,
  consultas: [] as Array<{
    tabela: string;
    op: string;
    filtros: [string, string, unknown][];
    patch?: unknown;
  }>,
  uploads: [] as Array<{ caminho: string; contentType: string }>,
  removidos: [] as string[][],
  baixar: null as unknown as ReturnType<typeof vi.fn<(...a: unknown[]) => unknown>>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[]) => ({
          data: caminhos.map((c) => ({
            path: c,
            signedUrl: `https://supa.test/assinado/${c}?token=x`,
          })),
          error: null,
        }),
        upload: async (caminho: string, _b: Uint8Array, o: { contentType: string }) => {
          estado.uploads.push({ caminho, contentType: o.contentType });
          return { error: null };
        },
        remove: async (cs: string[]) => {
          estado.removidos.push(cs);
          return { error: null };
        },
      }),
    },
  },
}));

vi.mock("./db", () => ({
  crm: (tabela: string) => {
    const c: Consulta = { tabela, op: "select", filtros: [] };
    estado.consultas.push(c);
    const valor = (f: string) => c.filtros.find(([, col]) => col === f)?.[2];
    const responder = () => {
      if (tabela === "whatsapp_instance_secrets") return { data: estado.cofre, error: null };
      if (c.op === "update") {
        return { data: estado.gravouCaminho ? [{ id: "m1" }] : [], error: null };
      }
      const m = estado.mensagem;
      // A loja ENTRA na consulta: mensagem de outra loja não é encontrada.
      if (!m || valor("tenant_id") !== m.tenant_id || valor("id") !== m.id) {
        return { data: null, error: null };
      }
      // A outra tela gravou o caminho DEPOIS da nossa primeira leitura.
      const leituras = estado.consultas.filter(
        (x) => x.tabela === "crm_messages" && x.op === "select",
      );
      if (estado.caminhoDoOutro && leituras.indexOf(c) > 0) {
        return { data: { ...m, media_path: estado.caminhoDoOutro }, error: null };
      }
      return { data: m, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: unknown) => {
        c.op = "update";
        c.patch = p;
        return q;
      },
      eq: (col: string, v: unknown) => {
        c.filtros.push(["eq", col, v]);
        return q;
      },
      is: (col: string, v: unknown) => {
        c.filtros.push(["is", col, v]);
        return q;
      },
      maybeSingle: async () => responder(),
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve(responder()).then(ok, erro),
    };
    return q;
  },
}));

vi.mock("@/lib/whatsapp/uazapi", () => {
  estado.baixar = vi.fn<(...a: unknown[]) => unknown>();
  return {
    configUazapi: () => ({ baseUrl: "https://flycontrol.uazapi.com", adminToken: "adm" }),
    baixarMidiaDaMensagem: (...a: unknown[]) => estado.baixar(...a),
  };
});

import { recuperarMidiaDaMensagem } from "./midiaServidor";

const LOJA = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);

function resposta(bytes: Uint8Array, cabecalhos: Record<string, string> = {}) {
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: cabecalhos });
}

beforeEach(() => {
  estado.mensagem = {
    id: "m1",
    tenant_id: LOJA,
    conversation_id: "conv-1",
    media_type: "audio",
    media_path: null,
    media_url: null,
    external_id: "3EB0ABC",
  };
  estado.cofre = { instance_token: "token-do-aparelho" };
  estado.gravouCaminho = true;
  estado.caminhoDoOutro = null;
  estado.consultas.length = 0;
  estado.uploads.length = 0;
  estado.removidos.length = 0;
  estado.baixar.mockReset();
  estado.baixar.mockResolvedValue({
    ok: true,
    dados: {
      fileURL: "https://flycontrol.uazapi.com/files/abc.mp3",
      mimetype: "audio/mpeg",
      base64: null,
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta(MP3, { "content-type": "audio/mpeg" })),
  );
});

describe("isolamento entre lojas", () => {
  it("o número de uma mensagem de outra loja não abre nada", async () => {
    const r = await recuperarMidiaDaMensagem(OUTRA, "m1");
    expect(r).toEqual({
      ok: false,
      motivo: "Mensagem não encontrada nesta loja.",
      definitivo: true,
    });
    expect(estado.baixar).not.toHaveBeenCalled();
    expect(estado.uploads).toHaveLength(0);
  });

  it("toda consulta à mensagem leva a loja junto", async () => {
    await recuperarMidiaDaMensagem(LOJA, "m1");
    const daMensagem = estado.consultas.filter((c) => c.tabela === "crm_messages");
    expect(daMensagem.length).toBeGreaterThan(0);
    for (const c of daMensagem) {
      expect(c.filtros).toContainEqual(["eq", "tenant_id", LOJA]);
    }
    const cofre = estado.consultas.find((c) => c.tabela === "whatsapp_instance_secrets");
    expect(cofre?.filtros).toContainEqual(["eq", "tenant_id", LOJA]);
  });
});

describe("arquivo já guardado", () => {
  it("só assina o endereço — não vai ao WhatsApp", async () => {
    estado.mensagem!.media_path = `${LOJA}/conv-1/1700000000000-abc123-foto.jpg`;
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nome).toBe("foto.jpg");
    expect(estado.baixar).not.toHaveBeenCalled();
  });
});

describe("buscar no WhatsApp e guardar", () => {
  it("baixa o áudio em MP3, guarda na pasta da loja e grava o caminho", async () => {
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(true);
    expect(estado.baixar).toHaveBeenCalledWith("token-do-aparelho", "3EB0ABC", { mp3: true });
    expect(estado.uploads).toHaveLength(1);
    expect(estado.uploads[0].contentType).toBe("audio/mpeg");
    expect(estado.uploads[0].caminho.startsWith(`${LOJA}/conv-1/`)).toBe(true);
    expect(estado.uploads[0].caminho.endsWith(".mp3")).toBe(true);

    const gravacao = estado.consultas.find((c) => c.op === "update");
    // Só grava se ninguém gravou antes — é o que impede dois arquivos.
    expect(gravacao?.filtros).toContainEqual(["is", "media_path", null]);
    expect(gravacao?.filtros).toContainEqual(["eq", "tenant_id", LOJA]);
  });

  it("foto não pede MP3", async () => {
    estado.mensagem!.media_type = "image";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))),
    );
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(true);
    expect(estado.baixar).toHaveBeenCalledWith("token-do-aparelho", "3EB0ABC", { mp3: false });
    expect(estado.uploads[0].contentType).toBe("image/jpeg");
  });

  it("aceita o arquivo que vem direto em base64", async () => {
    estado.baixar.mockResolvedValue({
      ok: true,
      dados: { fileURL: null, mimetype: "audio/mpeg", base64: btoa(String.fromCharCode(...MP3)) },
    });
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("duas telas ao mesmo tempo: a segunda apaga a cópia dela e usa a da primeira", async () => {
    estado.gravouCaminho = false;
    estado.caminhoDoOutro = `${LOJA}/conv-1/1700000000000-zzz-audio-m1.mp3`;
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.caminho).toBe(estado.caminhoDoOutro);
    expect(estado.removidos).toEqual([[estado.uploads[0].caminho]]);
  });
});

describe("o que é recusado", () => {
  it("endereço de arquivo fora da UAZAPI não é baixado", async () => {
    estado.baixar.mockResolvedValue({
      ok: true,
      dados: {
        fileURL: "https://servidor-estranho.com/x.mp3",
        mimetype: "audio/mpeg",
        base64: null,
      },
    });
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(estado.uploads).toHaveLength(0);
  });

  it("página da internet disfarçada de foto não é guardada", async () => {
    estado.mensagem!.media_type = "image";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(new TextEncoder().encode("<html><script>x</script>"))),
    );
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(false);
    expect(estado.uploads).toHaveLength(0);
  });

  it("arquivo grande demais é recusado antes de baixar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(MP3, { "content-length": String(50 * 1024 * 1024) })),
    );
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r).toMatchObject({ ok: false, definitivo: true });
    if (!r.ok) expect(r.motivo).toMatch(/grande demais/);
  });

  it("WhatsApp fora do ar: pede para tentar de novo, sem mostrar o erro cru", async () => {
    estado.baixar.mockResolvedValue({
      ok: false,
      erro: "internal: token=abc stack trace",
      status: 502,
      podeTentarDeNovo: true,
    });
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r).toEqual({
      ok: false,
      motivo: "O WhatsApp não respondeu agora. Tente de novo.",
      definitivo: false,
    });
  });

  it("WhatsApp da loja desconectado: diz o que fazer", async () => {
    estado.cofre = null;
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/não está conectado/);
  });

  it("mensagem sem arquivo nenhum não vai ao WhatsApp", async () => {
    estado.mensagem!.media_type = null;
    const r = await recuperarMidiaDaMensagem(LOJA, "m1");
    expect(r).toMatchObject({ ok: false, definitivo: true });
    expect(estado.baixar).not.toHaveBeenCalled();
  });
});

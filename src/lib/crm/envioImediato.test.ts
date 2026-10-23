import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O ENVIO NA HORA da resposta do painel — com banco e WhatsApp de mentira.
 *
 * O que não pode acontecer, e é testado aqui:
 *   - a mensagem se perder porque o WhatsApp não respondeu;
 *   - o cliente receber a terceira frase antes da segunda;
 *   - a loja com o fluxo pausado continuar enviando;
 *   - o atalho pegar mensagem que o n8n já reservou.
 */

type Filtro = [string, unknown];
type Chamada = { tabela: string; op: string; patch?: Record<string, unknown>; filtros: Filtro[] };

const estado = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  rpcs: [] as Array<Record<string, unknown>>,
  ligacao: { status: "active" } as Record<string, unknown> | null,
  cofre: { instance_token: "tok" } as Record<string, unknown> | null,
  reservadas: [] as Array<Record<string, unknown>>,
  envios: [] as string[],
  respostas: [] as unknown[],
}));

vi.mock("./db", () => {
  function construtor(tabela: string) {
    const c: Chamada = { tabela, op: "select", filtros: [] };
    estado.chamadas.push(c);
    const resultado = () => {
      if (tabela === "crm_n8n_links") return { data: estado.ligacao, error: null };
      if (tabela === "whatsapp_instance_secrets") return { data: estado.cofre, error: null };
      if (tabela === "crm_conversations") return { data: { customer_id: "cli-1" }, error: null };
      if (tabela === "marketing_customers")
        return { data: { phone_e164: "5571999990000" }, error: null };
      if (tabela === "crm_messages" && c.op === "update" && c.patch?.status === "sending")
        return { data: estado.reservadas, error: null };
      return { data: null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (patch: Record<string, unknown>) => {
        c.op = "update";
        c.patch = patch;
        return q;
      },
      eq: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
      is: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
      in: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
      maybeSingle: async () => resultado(),
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve(resultado()).then(ok, erro),
    };
    return q;
  }
  return {
    crm: (t: string) => construtor(t),
    crmRpc: async (_nome: string, args: Record<string, unknown>) => {
      estado.rpcs.push(args);
      return { data: true, error: null };
    },
  };
});

vi.mock("./midiaServidor", () => ({
  enderecosAssinados: async (caminhos: string[]) =>
    new Map(caminhos.map((c) => [c, `https://assinado/${c}`])),
}));

vi.mock("@/lib/whatsapp/uazapi", () => ({
  configUazapi: () => ({ baseUrl: "https://uaz", adminToken: "adm" }),
  enviarTexto: async (_t: string, _n: string, texto: string) => {
    estado.envios.push(texto);
    return estado.respostas.shift() ?? { ok: true, dados: { messageId: `wa-${texto}` } };
  },
  enviarMidia: async (_t: string, _n: string, tipo: string, url: string) => {
    estado.envios.push(`${tipo}:${url}`);
    return estado.respostas.shift() ?? { ok: true, dados: { messageId: "wa-midia" } };
  },
}));

import { destinoDoEnvio, entregarAgora, tipoParaUazapi } from "./envioImediato";

function msg(id: string, body: string, minuto: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    body,
    media_path: null,
    media_type: null,
    created_at: `2026-10-23T10:${String(minuto).padStart(2, "0")}:00Z`,
    ...extra,
  };
}

const devolucoes = () =>
  estado.chamadas.filter(
    (c) => c.tabela === "crm_messages" && c.op === "update" && c.patch?.status === "queued",
  );

beforeEach(() => {
  estado.chamadas = [];
  estado.rpcs = [];
  estado.envios = [];
  estado.respostas = [];
  estado.ligacao = { status: "active" };
  estado.cofre = { instance_token: "tok" };
  estado.reservadas = [];
});

describe("destinoDoEnvio", () => {
  it("separa enviado, recusado e sem resposta", () => {
    expect(destinoDoEnvio({ ok: true, dados: {} })).toBe("sent");
    expect(destinoDoEnvio({ ok: false, erro: "x", status: 400, podeTentarDeNovo: false })).toBe(
      "failed",
    );
    expect(destinoDoEnvio({ ok: false, erro: "x", podeTentarDeNovo: true })).toBe("fila");
  });
});

describe("tipoParaUazapi", () => {
  it("usa imagem para o que não é áudio, vídeo ou documento", () => {
    expect(tipoParaUazapi("audio")).toBe("audio");
    expect(tipoParaUazapi("document")).toBe("document");
    expect(tipoParaUazapi(null)).toBe("image");
  });
});

describe("entregarAgora", () => {
  it("envia na ordem em que a equipe escreveu e marca como enviada", async () => {
    estado.reservadas = [msg("b", "segunda", 2), msg("a", "primeira", 1)];
    await entregarAgora("loja-1", "conv-1");

    expect(estado.envios).toEqual(["primeira", "segunda"]);
    expect(estado.rpcs.map((r) => [r.p_message_id, r.p_status, r.p_external_id])).toEqual([
      ["a", "sent", "wa-primeira"],
      ["b", "sent", "wa-segunda"],
    ]);
  });

  it("só reserva o que está livre na fila desta loja e desta conversa", async () => {
    await entregarAgora("loja-1", "conv-1");
    const reserva = estado.chamadas.find(
      (c) => c.tabela === "crm_messages" && c.patch?.status === "sending",
    );
    expect(reserva?.filtros).toEqual(
      expect.arrayContaining([
        ["tenant_id", "loja-1"],
        ["conversation_id", "conv-1"],
        ["direction", "out"],
        ["status", "queued"],
        ["lease_until", null],
      ]),
    );
  });

  it("WhatsApp sem resposta: esta e as seguintes voltam para a fila, nada é perdido", async () => {
    estado.reservadas = [msg("a", "um", 1), msg("b", "dois", 2), msg("c", "tres", 3)];
    estado.respostas = [
      { ok: true, dados: { messageId: "wa-1" } },
      { ok: false, erro: "demorou", podeTentarDeNovo: true },
    ];
    await entregarAgora("loja-1", "conv-1");

    expect(estado.envios).toEqual(["um", "dois"]);
    expect(estado.rpcs.map((r) => r.p_message_id)).toEqual(["a"]);
    const volta = devolucoes().at(-1);
    expect(volta?.filtros).toEqual(expect.arrayContaining([["id", ["b", "c"]]]));
  });

  it("WhatsApp recusou: marca como falha com o motivo", async () => {
    estado.reservadas = [msg("a", "oi", 1)];
    estado.respostas = [
      { ok: false, erro: "número inválido", status: 400, podeTentarDeNovo: false },
    ];
    await entregarAgora("loja-1", "conv-1");

    expect(estado.rpcs[0]).toMatchObject({
      p_status: "failed",
      p_error: "WhatsApp: número inválido",
    });
  });

  it("arquivo vai por /send/media com o endereço assinado", async () => {
    estado.reservadas = [msg("a", "", 1, { media_path: "loja/foto.jpg", media_type: "image" })];
    await entregarAgora("loja-1", "conv-1");
    expect(estado.envios).toEqual(["image:https://assinado/loja/foto.jpg"]);
  });

  it("fluxo pausado não envia nem reserva nada", async () => {
    estado.ligacao = { status: "paused" };
    estado.reservadas = [msg("a", "oi", 1)];
    await entregarAgora("loja-1", "conv-1");
    expect(estado.envios).toEqual([]);
    expect(estado.chamadas.some((c) => c.patch?.status === "sending")).toBe(false);
  });

  it("sem aparelho conectado, deixa na fila", async () => {
    estado.cofre = null;
    estado.reservadas = [msg("a", "oi", 1)];
    await entregarAgora("loja-1", "conv-1");
    expect(estado.envios).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { atenderRotaDaMaya, modoDaMaya } from "./portaria";

/**
 * A porta de /api/maya/*: sem a chave certa ninguém entra, e com a MAYA 2.0
 * desligada nada é executado. A rota pública antiga da MAYA no n8n não tinha
 * porta nenhuma — qualquer um que soubesse o endereço podia fazê-la mandar
 * mensagem para qualquer número.
 */

const pedido = (corpo: unknown, chave?: string) =>
  new Request("https://x/api/maya/entrada", {
    method: "POST",
    headers: chave ? { authorization: `Bearer ${chave}` } : {},
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

afterEach(() => {
  delete process.env.MAYA_N8N_SECRET;
  delete process.env.MAYA_V2_MODO;
});

describe("porta das rotas da MAYA", () => {
  it("sem chave configurada no servidor, a porta fica fechada (503)", async () => {
    const executar = vi.fn();
    const r = await atenderRotaDaMaya(pedido({}, "qualquer"), executar);
    expect(r.status).toBe(503);
    expect(executar).not.toHaveBeenCalled();
  });

  it("chave errada ou ausente → 401, nada executa", async () => {
    process.env.MAYA_N8N_SECRET = "segredo-certo";
    process.env.MAYA_V2_MODO = "ativo";
    const executar = vi.fn();
    expect((await atenderRotaDaMaya(pedido({}, "errado"), executar)).status).toBe(401);
    expect((await atenderRotaDaMaya(pedido({}), executar)).status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it("MAYA 2.0 desligada (padrão) → responde 'desligado' sem executar nada", async () => {
    process.env.MAYA_N8N_SECRET = "segredo-certo";
    const executar = vi.fn();
    const r = await atenderRotaDaMaya(pedido({}, "segredo-certo"), executar);
    expect(await r.json()).toEqual({ success: true, acao: "desligado" });
    expect(executar).not.toHaveBeenCalled();
  });

  it("corpo inválido → 400", async () => {
    process.env.MAYA_N8N_SECRET = "s";
    expect((await atenderRotaDaMaya(pedido("não é json", "s"), vi.fn())).status).toBe(400);
  });

  it("erro interno não vaza detalhe para fora", async () => {
    process.env.MAYA_N8N_SECRET = "s";
    process.env.MAYA_V2_MODO = "sombra";
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await atenderRotaDaMaya(pedido({}, "s"), async () => {
      throw new Error("tabela maya_conversas não existe");
    });
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("maya_conversas");
    erro.mockRestore();
  });

  it("só 'ativo' e 'sombra' ligam; qualquer outro valor deixa desligado", () => {
    for (const [v, esperado] of [
      ["ativo", "ativo"],
      [" SOMBRA ", "sombra"],
      ["on", "desligado"],
      ["", "desligado"],
    ] as const) {
      process.env.MAYA_V2_MODO = v;
      expect(modoDaMaya()).toBe(esperado);
    }
  });
});

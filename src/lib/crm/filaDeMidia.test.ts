import { describe, expect, it, vi } from "vitest";
import { criarFila, criarMemoriaDeMidia, type ResultadoMidia } from "./filaDeMidia";

/**
 * O ESTRAGO QUE ESTES TESTES EVITAM: abrir uma conversa com 40 fotos e
 * disparar 40 pedidos ao WhatsApp da loja ao mesmo tempo — ou pedir a mesma
 * foto de novo a cada mensagem nova que chega.
 */

function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

const tique = () => new Promise((r) => setTimeout(r, 0));

describe("a fila", () => {
  it("nunca passa de três ao mesmo tempo", async () => {
    const naFila = criarFila(3);
    let ativos = 0;
    let pico = 0;
    const travas = Array.from({ length: 8 }, () => adiado<void>());
    const tarefas = travas.map((t) =>
      naFila(async () => {
        ativos++;
        pico = Math.max(pico, ativos);
        await t.promessa;
        ativos--;
      }),
    );
    await tique();
    expect(ativos).toBe(3);
    for (const t of travas) {
      t.resolver();
      await tique();
    }
    await Promise.all(tarefas);
    expect(pico).toBe(3);
  });
});

describe("a memória de arquivos", () => {
  const ok: ResultadoMidia = {
    ok: true,
    url: "https://x/assinado",
    caminho: "l/c/a.jpg",
    nome: "a.jpg",
  };

  it("o mesmo arquivo é pedido uma vez só", async () => {
    const carregar = vi.fn(async () => ok);
    const obter = criarMemoriaDeMidia(carregar);
    await Promise.all([obter("m1"), obter("m1"), obter("m1")]);
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("'tentar de novo' (forçar) vai ao servidor de verdade", async () => {
    const carregar = vi.fn(async () => ok);
    const obter = criarMemoriaDeMidia(carregar);
    await obter("m1");
    await obter("m1", true);
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it("falha passageira não fica lembrada", async () => {
    const carregar = vi
      .fn<(id: string) => Promise<ResultadoMidia>>()
      .mockResolvedValueOnce({ ok: false, motivo: "rede", definitivo: false })
      .mockResolvedValueOnce(ok);
    const obter = criarMemoriaDeMidia(carregar);
    expect((await obter("m1")).ok).toBe(false);
    expect((await obter("m1")).ok).toBe(true);
  });

  it("falha definitiva fica lembrada (não insiste a cada redesenho)", async () => {
    const carregar = vi.fn(async (): Promise<ResultadoMidia> => ({
      ok: false,
      motivo: "O WhatsApp não tem mais este arquivo.",
      definitivo: true,
    }));
    const obter = criarMemoriaDeMidia(carregar);
    await obter("m1");
    await obter("m1");
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("servidor fora do ar vira mensagem clara, não erro na tela", async () => {
    const obter = criarMemoriaDeMidia(async () => {
      throw new Error("Failed to fetch");
    });
    const r = await obter("m1");
    expect(r).toEqual({
      ok: false,
      motivo: "Sem conexão com o servidor. Tente de novo.",
      definitivo: false,
    });
  });
});

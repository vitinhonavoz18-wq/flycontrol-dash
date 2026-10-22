import { describe, expect, it } from "vitest";
import { estaNoFim, mesclarMensagens } from "./historico";

/**
 * O ESTRAGO QUE ESTES TESTES EVITAM: a mesma mensagem duas vezes na tela.
 *
 * A resposta do envio e o aviso em tempo real chegam quase juntos. Se os dois
 * empilhassem, o atendente veria a própria resposta duplicada — e o cliente,
 * na dúvida, poderia receber duas vezes porque alguém "reenviou".
 */

const m = (id: string, hora: string, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: `2026-10-22T${hora}:00.000Z`,
  status: "queued",
  ...extra,
});

describe("juntar o histórico sem repetir", () => {
  it("a mesma mensagem por dois caminhos aparece uma vez", () => {
    const r = mesclarMensagens([m("a", "10:00"), m("b", "10:01")], [m("b", "10:01")]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("a versão mais nova vale ('na fila' vira 'enviada')", () => {
    const r = mesclarMensagens([m("b", "10:01")], [m("b", "10:01", { status: "sent" })]);
    expect(r[0].status).toBe("sent");
  });

  it("as antigas carregadas antes continuam na tela", () => {
    const antigas = [m("velha", "08:00"), m("a", "10:00")];
    const recentes = [m("a", "10:00"), m("nova", "10:05")];
    expect(mesclarMensagens(antigas, recentes).map((x) => x.id)).toEqual(["velha", "a", "nova"]);
  });

  it("fica em ordem de horário mesmo chegando fora de ordem", () => {
    const r = mesclarMensagens([m("c", "10:03")], [m("a", "10:01"), m("b", "10:02")]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("a pessoa está lendo o fim da conversa?", () => {
  it("no fim (ou quase) conta como fim", () => {
    expect(estaNoFim({ scrollTop: 900, scrollHeight: 1500, clientHeight: 500 })).toBe(true);
  });

  it("subiu para reler: não está no fim", () => {
    expect(estaNoFim({ scrollTop: 100, scrollHeight: 1500, clientHeight: 500 })).toBe(false);
  });
});

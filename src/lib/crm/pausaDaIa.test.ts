import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MINUTOS_DE_PAUSA, horaDeVoltarAFalar, iaEstaPausada } from "./pausaDaIa";

/**
 * A trava que impede a IA de atropelar o atendente humano.
 *
 * O estrago concreto que cada teste evita: o cliente conversando com duas
 * pessoas ao mesmo tempo, cada uma com uma versão da história — e um pedido
 * saindo errado por causa disso.
 */

const RAIZ = process.cwd();
const AGORA = new Date("2026-09-20T20:00:00.000Z");

describe("quando a IA pode voltar a falar", () => {
  it("a trava dura uma hora e se solta sozinha", () => {
    // Trava sem prazo precisaria de alguém para desligar, e ninguém lembra.
    // Esta é a moeda do parquímetro: vale até a hora marcada e depois acaba.
    const ate = horaDeVoltarAFalar(AGORA);
    expect(MINUTOS_DE_PAUSA).toBe(60);
    expect(ate).toBe("2026-09-20T21:00:00.000Z");
  });

  it("dentro da hora a IA fica calada; passou a hora, volta a atender", () => {
    const ate = horaDeVoltarAFalar(AGORA);

    expect(iaEstaPausada(ate, new Date("2026-09-20T20:30:00.000Z"))).toBe(true);
    expect(iaEstaPausada(ate, new Date("2026-09-20T20:59:59.000Z"))).toBe(true);
    expect(iaEstaPausada(ate, new Date("2026-09-20T21:00:01.000Z"))).toBe(false);
  });

  it("na dúvida, DEIXA FALAR", () => {
    // Coluna vazia é o estado normal de quase toda conversa. Travar por
    // dúvida deixaria a loja inteira muda sem ninguém entender por quê.
    expect(iaEstaPausada(null, AGORA)).toBe(false);
    expect(iaEstaPausada(undefined, AGORA)).toBe(false);
    expect(iaEstaPausada("", AGORA)).toBe(false);
    expect(iaEstaPausada("data que não é data", AGORA)).toBe(false);
  });
});

describe("os dois caminhos por onde um humano responde", () => {
  function soCodigo(caminho: string): string {
    return readFileSync(join(RAIZ, caminho), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it("o dono respondendo PELO CELULAR trava a IA", () => {
    // Esta é a metade que já funcionava. Continua tendo de funcionar.
    const codigo = soCodigo("src/routes/api/crm.inbox.ts");
    expect(codigo).toContain("horaDeVoltarAFalar");
    expect(codigo).toContain("doRestaurante");
  });

  it("o atendente respondendo PELO PAINEL também trava a IA", () => {
    // Esta é a metade que faltava, e era justamente o caminho mais usado. A
    // mensagem do painel sai do FlyControl direto para o WhatsApp e nunca
    // volta para o fluxo — então quem tem de anotar a trava é o painel.
    const codigo = soCodigo("src/lib/crm/crm.functions.ts");
    expect(codigo).toContain("ia_pausada_ate");
    expect(codigo).toContain("horaDeVoltarAFalar");
  });

  it("a resposta da própria IA NÃO trava a IA", () => {
    // Se a resposta da IA travasse a IA, ela se calaria sozinha depois da
    // primeira frase e a conversa morreria no meio.
    const codigo = soCodigo("src/routes/api/crm.reply.ts");
    expect(codigo).not.toContain("ia_pausada_ate");
  });

  it("o fluxo do n8n recebe a resposta pronta, em vez de adivinhar", () => {
    // O fluxo pergunta ao FlyControl "posso responder?" na mesma chamada em
    // que entrega a mensagem. Uma viagem só, e a resposta vem de quem sabe.
    const codigo = soCodigo("src/routes/api/crm.inbox.ts");
    expect(codigo).toContain("ia_pausada");
  });
});

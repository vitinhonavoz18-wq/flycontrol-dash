import { describe, expect, it } from "vitest";
import { extrairDaUazapi } from "./uazapiEvento";

/**
 * O filtro da porta de entrada do Chat.
 *
 * O ESTRAGO QUE ESTES TESTES EVITAM
 *
 * Sem o filtro de `fromMe`, cada resposta do atendente voltaria pela porta da
 * frente como se fosse uma mensagem nova do cliente. A conversa viraria um
 * eco: ele responde, a resposta dele reaparece como pergunta, a bolinha de
 * não lida acende, ele responde de novo. Em uma tarde, uma conversa de dez
 * mensagens vira cem.
 */

function mensagem(extra: Record<string, unknown> = {}) {
  return {
    event: "messages",
    instance: "inst-123",
    data: {
      messageid: "MSG-1",
      chatid: "5571999999999@s.whatsapp.net",
      sender: "5571999999999@s.whatsapp.net",
      senderName: "João",
      fromMe: false,
      isGroup: false,
      messageType: "conversation",
      text: "Oi, o pedido já saiu?",
      ...extra,
    },
  };
}

describe("o que entra no Chat", () => {
  it("mensagem de cliente vira conversa", () => {
    const r = extrairDaUazapi(mensagem());
    expect(r?.ignorar).toBeUndefined();
    expect(r?.telefone).toBe("5571999999999");
    expect(r?.texto).toBe("Oi, o pedido já saiu?");
    expect(r?.nome).toBe("João");
    expect(r?.externalId).toBe("MSG-1");
  });

  it("o telefone vem só com dígitos, do jeito que o resto do sistema usa", () => {
    // "5571999999999@s.whatsapp.net" não é telefone: é endereço. Guardar assim
    // faria o mesmo cliente virar dois — um pelo pedido, outro pelo Chat.
    expect(extrairDaUazapi(mensagem())?.telefone).toMatch(/^\d+$/);
  });

  it("guarda o arquivo quando a mensagem tem foto ou áudio", () => {
    const r = extrairDaUazapi(
      mensagem({ messageType: "imageMessage", fileURL: "https://x.test/foto.jpg", text: "" }),
    );
    expect(r?.mediaUrl).toBe("https://x.test/foto.jpg");
    expect(r?.mediaType).toBe("imagemessage");
    expect(r?.texto).toBeNull();
  });
});

describe("o que NÃO entra no Chat", () => {
  it("a própria resposta do restaurante é descartada", () => {
    expect(extrairDaUazapi(mensagem({ fromMe: true }))?.ignorar).toBe(true);
  });

  it("mensagem de grupo é descartada", () => {
    expect(extrairDaUazapi(mensagem({ isGroup: true }))?.ignorar).toBe(true);
  });

  it("grupo também é pego pelo endereço, mesmo sem a marca isGroup", () => {
    // Um fornecedor pode mandar o evento sem `isGroup`. O endereço entrega.
    const r = extrairDaUazapi(
      mensagem({ isGroup: undefined, sender: "120363000000@g.us", chatid: "120363000000@g.us" }),
    );
    expect(r?.ignorar).toBe(true);
  });

  it("canal de transmissão é descartado", () => {
    const r = extrairDaUazapi(mensagem({ sender: "123@newsletter", chatid: "123@newsletter" }));
    expect(r?.ignorar).toBe(true);
  });
});

describe("quando não é um evento da UAZAPI", () => {
  it("devolve nulo para o fluxo que monta tudo na mão", () => {
    // O formato simples ({ phone, message }) continua valendo — este tradutor
    // sai de cena em vez de atrapalhar.
    expect(extrairDaUazapi({ phone: "5571999999999", message: "oi" })).toBeNull();
    expect(extrairDaUazapi({})).toBeNull();
    expect(extrairDaUazapi({ data: "texto solto" })).toBeNull();
    expect(extrairDaUazapi({ data: {} })).toBeNull();
  });

  it("aguenta uma lista com um item, que é como alguns fluxos repassam", () => {
    const evento = mensagem();
    const r = extrairDaUazapi({ ...evento, data: [evento.data] });
    expect(r?.telefone).toBe("5571999999999");
  });

  it("aguenta uma lista vazia sem quebrar", () => {
    expect(extrairDaUazapi({ data: [] })).toBeNull();
  });
});

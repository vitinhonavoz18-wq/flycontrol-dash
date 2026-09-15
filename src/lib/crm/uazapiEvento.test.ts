import { describe, expect, it } from "vitest";
import { extrairDaUazapi } from "./uazapiEvento";

/**
 * O filtro da porta de entrada do Chat.
 *
 * O ESTRAGO QUE ESTES TESTES EVITAM
 *
 * Aconteceu de verdade: três clientes diferentes foram gravados com o nome
 * "flycontrol" — o nome do perfil DA LOJA. O evento traz vários campos com
 * cara de nome, e o fluxo estava lendo o único que, numa mensagem digitada
 * pelo dono, devolve o nome da própria loja.
 *
 * E a mensagem que o dono digitava no celular dele aparecia no painel como se
 * fosse o CLIENTE falando.
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

describe("quando quem digitou foi o próprio restaurante", () => {
  it("a mensagem entra marcada como da loja, e não é descartada", () => {
    // Descartar fazia a resposta dada pelo celular sumir do painel: quem
    // olhasse a conversa via o cliente perguntando e ninguém respondendo.
    const r = extrairDaUazapi(mensagem({ fromMe: true }));
    expect(r?.ignorar).toBeUndefined();
    expect(r?.fromMe).toBe(true);
  });

  it("o nome que vem junto NÃO é usado — é o nome da loja", () => {
    const r = extrairDaUazapi(mensagem({ fromMe: true, senderName: "flycontrol" }));
    expect(r?.nome).toBeNull();
  });

  it("o telefone continua sendo o do CLIENTE, não o da loja", () => {
    // Numa mensagem do dono, `sender` é o dono. Usar esse número abriria uma
    // conversa da loja com ela mesma.
    const r = extrairDaUazapi(
      mensagem({
        fromMe: true,
        sender: "557199373863@s.whatsapp.net",
        chatid: "5571999999999@s.whatsapp.net",
      }),
    );
    expect(r?.telefone).toBe("5571999999999");
  });
});

describe("de onde sai o nome do cliente", () => {
  it("o nome da agenda vale mais que quem assinou a mensagem", () => {
    const r = extrairDaUazapi({
      ...mensagem(),
      chat: { name: "Deposito Araújo", wa_contactName: "" },
    });
    expect(r?.nome).toBe("Deposito Araújo");
  });

  it("um cadastro feito à mão vale mais que tudo", () => {
    const r = extrairDaUazapi({
      ...mensagem(),
      chat: { lead_fullName: "Maria da Silva", name: "Maria", wa_contactName: "" },
    });
    expect(r?.nome).toBe("Maria da Silva");
  });

  it("campo vazio não conta como nome", () => {
    const r = extrairDaUazapi({
      ...mensagem(),
      chat: { lead_fullName: "", lead_name: "   ", name: "", wa_name: "Zé do Bar" },
    });
    expect(r?.nome).toBe("Zé do Bar");
  });

  it("sem nada na agenda, quem assinou a mensagem serve — se foi o cliente", () => {
    const r = extrairDaUazapi({ ...mensagem(), chat: { name: "", wa_contactName: "" } });
    expect(r?.nome).toBe("João");
  });
});

describe("o formato exato que a UAZAPI mandou em produção", () => {
  // Copiado de uma entrega real. Foi este evento que gravou "flycontrol" como
  // nome de cliente.
  const real = {
    EventType: "messages",
    chat: {
      name: "Deposito Araújo",
      wa_name: "Deposito Araújo",
      wa_contactName: "",
      lead_name: "",
      lead_fullName: "",
      phone: "+55 71 9235-4333",
      wa_chatid: "557192354333@s.whatsapp.net",
    },
    message: {
      chatid: "557192354333@s.whatsapp.net",
      fromMe: true,
      messageid: "3EB0ED5B70EFC15A4CFAEA",
      messageType: "Conversation",
      sender: "89215580815602@lid",
      senderName: "flycontrol",
      text: "ja ta quase pronto",
    },
  };

  it("pega o nome do cliente e não o da loja", () => {
    expect(extrairDaUazapi(real)?.nome).toBe("Deposito Araújo");
  });

  it("marca como mensagem da loja e guarda o telefone do cliente", () => {
    const r = extrairDaUazapi(real);
    expect(r?.fromMe).toBe(true);
    expect(r?.telefone).toBe("557192354333");
    expect(r?.texto).toBe("ja ta quase pronto");
  });
});

describe("o que NÃO entra no Chat", () => {
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

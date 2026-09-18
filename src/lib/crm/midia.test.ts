import { describe, expect, it } from "vitest";
import {
  tipoPeloWhatsApp,
  tipoPeloMime,
  resumoDaMensagem,
  conferirArquivo,
  caminhoDaMidia,
  ROTULO_MIDIA,
} from "./midia";

/**
 * O ESTRAGO QUE ESTES TESTES EVITAM: o balão vazio.
 *
 * Aconteceu de verdade — o cliente mandou áudio e o painel mostrou um espaço
 * em branco. O lojista não tinha como saber que alguém tinha falado com ele.
 */

describe("descobrir que tipo de arquivo é", () => {
  it("entende as várias formas que o WhatsApp escreve a mesma coisa", () => {
    for (const t of ["audioMessage", "AudioMessage", "ptt", "PTT", "voice"]) {
      expect(tipoPeloWhatsApp(t)).toBe("audio");
    }
    for (const t of ["imageMessage", "IMAGE", "stickerMessage"]) {
      expect(tipoPeloWhatsApp(t)).toBe("image");
    }
    expect(tipoPeloWhatsApp("videoMessage")).toBe("video");
    expect(tipoPeloWhatsApp("documentMessage")).toBe("document");
  });

  it("mensagem de texto não é arquivo", () => {
    expect(tipoPeloWhatsApp("conversation")).toBeNull();
    expect(tipoPeloWhatsApp("extendedTextMessage")).toBeNull();
    expect(tipoPeloWhatsApp("")).toBeNull();
    expect(tipoPeloWhatsApp(null)).toBeNull();
  });

  it("descobre também pelo tipo do arquivo", () => {
    expect(tipoPeloMime("image/jpeg")).toBe("image");
    expect(tipoPeloMime("audio/ogg; codecs=opus")).toBe("audio");
    expect(tipoPeloMime("video/mp4")).toBe("video");
    expect(tipoPeloMime("application/pdf")).toBe("document");
    expect(tipoPeloMime("coisa/estranha")).toBeNull();
  });
});

describe("o que aparece na lista de conversas", () => {
  it("a transcrição ganha do rótulo — dizer o que foi falado vale mais", () => {
    expect(resumoDaMensagem("quero 2 pizzas", "audioMessage")).toBe("Áudio: quero 2 pizzas");
  });

  it("sem transcrição, pelo menos diz que é um áudio — nunca vazio", () => {
    expect(resumoDaMensagem("", "audioMessage")).toBe("Áudio");
    expect(resumoDaMensagem(null, "imageMessage")).toBe("Foto");
  });

  it("mensagem de texto continua sendo só o texto", () => {
    expect(resumoDaMensagem("boa noite", "conversation")).toBe("boa noite");
  });

  it("todo tipo tem rótulo — nenhum cai em branco", () => {
    for (const r of Object.values(ROTULO_MIDIA)) expect(r.length).toBeGreaterThan(0);
  });
});

describe("a porta do arquivo que sai do painel", () => {
  it("aceita foto, áudio, vídeo e PDF", () => {
    expect(conferirArquivo("image/png", 1000)).toEqual({ ok: true, tipo: "image" });
    expect(conferirArquivo("audio/ogg", 1000)).toEqual({ ok: true, tipo: "audio" });
    expect(conferirArquivo("application/pdf", 1000)).toEqual({ ok: true, tipo: "document" });
  });

  it("recusa arquivo grande demais ANTES de mandar", () => {
    // O WhatsApp recusaria depois, com o lojista já achando que mandou.
    const r = conferirArquivo("image/png", 11 * 1024 * 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("10MB");
  });

  it("recusa tipo estranho e arquivo vazio", () => {
    expect(conferirArquivo("aplicacao/virus-maluco", 10).ok).toBe(false);
    expect(conferirArquivo("image/png", 0).ok).toBe(false);
  });
});

describe("onde o arquivo é guardado", () => {
  const LOJA = "11111111-1111-1111-1111-111111111111";
  const CONVERSA = "22222222-2222-2222-2222-222222222222";

  it("o caminho SEMPRE começa pela loja", () => {
    // É isso que permite a regra "cada loja mexe só na própria pasta".
    expect(caminhoDaMidia(LOJA, CONVERSA, "foto.jpg").startsWith(`${LOJA}/`)).toBe(true);
  });

  it("nome com acento, espaço ou barra vira nome seguro", () => {
    const c = caminhoDaMidia(LOJA, CONVERSA, "../comprovante são joão.pdf");
    expect(c).not.toContain("..");
    expect(c).not.toContain("ã");
    expect(c.split("/")).toHaveLength(3);
  });

  it("dois arquivos com o mesmo nome não se atropelam", () => {
    const a = caminhoDaMidia(LOJA, CONVERSA, "foto.jpg");
    const b = caminhoDaMidia(LOJA, CONVERSA, "foto.jpg");
    expect(a).not.toBe(b);
  });
});

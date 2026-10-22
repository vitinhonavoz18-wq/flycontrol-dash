import { describe, expect, it } from "vitest";
import {
  decidirMime,
  enderecoConfiavel,
  farejarMime,
  nomeNoCaminho,
  extensaoDoMime,
} from "./midiaRecuperada";
import { caminhoDaMidia } from "./midia";

/**
 * O ESTRAGO QUE ESTES TESTES EVITAM
 *
 * O arquivo que vem do WhatsApp é guardado na pasta da loja e depois aberto
 * pelo navegador do lojista. Se o tipo fosse decidido pela etiqueta que vem de
 * fora, uma página da internet disfarçada de "foto" seria guardada e aberta
 * como foto — e um PDF corrompido apareceria como PDF que não abre, sem
 * explicação nenhuma.
 */

const b = (...xs: number[]) => new Uint8Array(xs);
const t = (s: string) => new Uint8Array(Array.from(s).map((c) => c.charCodeAt(0)));
function junta(...partes: Uint8Array[]) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

describe("descobrir o tipo verdadeiro pelos primeiros bytes", () => {
  it("reconhece foto, PDF e áudio", () => {
    expect(farejarMime(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(farejarMime(b(0x89, 0x50, 0x4e, 0x47, 0x0d))).toBe("image/png");
    expect(farejarMime(t("GIF89a"))).toBe("image/gif");
    expect(farejarMime(junta(t("RIFF"), b(0, 0, 0, 0), t("WEBPVP8 ")))).toBe("image/webp");
    expect(farejarMime(t("%PDF-1.7\n"))).toBe("application/pdf");
    expect(farejarMime(t("OggS\0"))).toBe("audio/ogg");
    expect(farejarMime(t("ID3\x04"))).toBe("audio/mpeg");
    expect(farejarMime(b(0xff, 0xfb, 0x90))).toBe("audio/mpeg");
  });

  it("separa áudio m4a de vídeo mp4", () => {
    expect(farejarMime(junta(b(0, 0, 0, 0x20), t("ftypM4A ")))).toBe("audio/mp4");
    expect(farejarMime(junta(b(0, 0, 0, 0x20), t("ftypisom")))).toBe("video/mp4");
  });

  it("não inventa tipo para o que não reconhece", () => {
    expect(farejarMime(t("<html><script>"))).toBeNull();
    expect(farejarMime(new Uint8Array())).toBeNull();
  });
});

describe("decidir se o arquivo pode ser guardado", () => {
  it("os bytes mandam mais que a etiqueta", () => {
    const r = decidirMime(b(0xff, 0xd8, 0xff, 0xe0), "image/png", "image");
    expect(r).toEqual({ ok: true, mime: "image/jpeg", ext: "jpg" });
  });

  it("página da internet disfarçada de foto é recusada", () => {
    const r = decidirMime(t("<html><script>alert(1)</script>"), "image/jpeg", "image");
    expect(r.ok).toBe(false);
  });

  it("PDF que não começa como PDF é dado como corrompido", () => {
    const r = decidirMime(t("isto não é pdf"), "application/pdf", "document");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalido).toBe(true);
      expect(r.motivo).toMatch(/corrompido/);
    }
  });

  it("PDF de verdade passa", () => {
    expect(decidirMime(t("%PDF-1.4"), "application/pdf", "document")).toEqual({
      ok: true,
      mime: "application/pdf",
      ext: "pdf",
    });
  });

  it("Word e Excel novos (que são .zip por dentro) só passam se declarados", () => {
    const zip = b(0x50, 0x4b, 0x03, 0x04);
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(decidirMime(zip, docx, "document")).toEqual({ ok: true, mime: docx, ext: "docx" });
    expect(decidirMime(zip, "application/zip", "document").ok).toBe(false);
  });

  it("áudio gravado em webm continua sendo áudio", () => {
    const webm = b(0x1a, 0x45, 0xdf, 0xa3);
    expect(decidirMime(webm, "audio/webm", "audio")).toEqual({
      ok: true,
      mime: "audio/webm",
      ext: "webm",
    });
  });

  it("texto simples só passa se declarado como texto", () => {
    expect(decidirMime(t("lista de compras"), "text/plain", "document").ok).toBe(true);
    expect(decidirMime(t("lista de compras"), "image/png", "image").ok).toBe(false);
  });
});

describe("só baixar de endereço da própria UAZAPI", () => {
  const base = "https://flycontrol.uazapi.com";

  it("aceita o endereço de arquivo da UAZAPI configurada", () => {
    expect(enderecoConfiavel("https://flycontrol.uazapi.com/files/abc.mp3", base)).toBe(true);
  });

  it("recusa outro servidor, http sem cadeado e endereço interno", () => {
    expect(enderecoConfiavel("https://outra.uazapi.com/files/abc.mp3", base)).toBe(false);
    expect(enderecoConfiavel("http://flycontrol.uazapi.com/files/abc.mp3", base)).toBe(false);
    expect(enderecoConfiavel("https://169.254.169.254/latest/meta-data", base)).toBe(false);
    expect(enderecoConfiavel("https://flycontrol.uazapi.com.malicioso.com/x", base)).toBe(false);
  });

  it("recusa lixo sem explodir", () => {
    expect(enderecoConfiavel("", base)).toBe(false);
    expect(enderecoConfiavel(null, base)).toBe(false);
    expect(enderecoConfiavel("javascript:alert(1)", base)).toBe(false);
  });
});

describe("o nome que o lojista lê", () => {
  it("tira o carimbo do começo do nome guardado", () => {
    const caminho = caminhoDaMidia("loja", "conversa", "cardapio.pdf");
    expect(nomeNoCaminho(caminho)).toBe("cardapio.pdf");
  });

  it("aguenta caminho vazio", () => {
    expect(nomeNoCaminho(null)).toBeNull();
    expect(nomeNoCaminho("")).toBeNull();
  });

  it("dá a extensão certa para cada tipo", () => {
    expect(extensaoDoMime("audio/mpeg")).toBe("mp3");
    expect(extensaoDoMime("application/pdf")).toBe("pdf");
    expect(extensaoDoMime("algo/estranho")).toBe("bin");
  });
});

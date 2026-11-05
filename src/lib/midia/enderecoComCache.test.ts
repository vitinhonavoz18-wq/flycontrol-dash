import { describe, expect, it } from "vitest";
import { enderecoDeOrigem, paraEnderecoComCache } from "./enderecoComCache";

const ASSINADA =
  "https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/produtos/123-abc.webp?token=eyJabc.def";

describe("paraEnderecoComCache", () => {
  it("troca a foto assinada do cardápio pelo endereço com cache, mantendo o token", () => {
    expect(paraEnderecoComCache(ASSINADA)).toBe(
      "https://flycontrol.conectfly.com.br/api/public/midia/knhenchgntttraaeewlj/sign/menu-images/produtos/123-abc.webp?token=eyJabc.def",
    );
  });

  it("troca também o endereço público das artes de status", () => {
    const pub =
      "https://laufyadcizmruejafcpi.supabase.co/storage/v1/object/public/status-arts/loja/saiu.png";
    expect(paraEnderecoComCache(pub)).toBe(
      "https://flycontrol.conectfly.com.br/api/public/midia/laufyadcizmruejafcpi/public/status-arts/loja/saiu.png",
    );
  });

  it("não mexe no que não é foto nossa", () => {
    expect(paraEnderecoComCache(null)).toBeNull();
    expect(paraEnderecoComCache(undefined)).toBeUndefined();
    expect(paraEnderecoComCache("")).toBe("");
    expect(paraEnderecoComCache("https://x/hero.mp4")).toBe("https://x/hero.mp4");
    // Projeto de outra pessoa no Supabase.
    const alheio =
      "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/menu-images/a.png";
    expect(paraEnderecoComCache(alheio)).toBe(alheio);
    // Mídia particular das conversas do chat fica fora.
    const chat =
      "https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/crm-chat-media/a.jpg?token=t";
    expect(paraEnderecoComCache(chat)).toBe(chat);
  });

  it("ida e volta dão no mesmo arquivo", () => {
    const novo = new URL(paraEnderecoComCache(ASSINADA));
    const trecho = novo.pathname.replace("/api/public/midia/", "");
    expect(enderecoDeOrigem(trecho, novo.search)).toBe(ASSINADA);
  });
});

describe("enderecoDeOrigem", () => {
  it("recusa projeto, gaveta ou acesso fora da lista", () => {
    expect(enderecoDeOrigem("aaaaaaaaaaaaaaaaaaaa/public/menu-images/a.png", "")).toBeNull();
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/public/crm-chat-media/a.png", "")).toBeNull();
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/upload/menu-images/a.png", "")).toBeNull();
  });

  it("recusa caminhos que tentam sair da pasta", () => {
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/public/menu-images/../x", "")).toBeNull();
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/public/menu-images/%2e%2e/x", "")).toBeNull();
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/public/menu-images//x", "")).toBeNull();
  });

  it("exige o token nas fotos assinadas e descarta parâmetros extras", () => {
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/sign/menu-images/a.png", "")).toBeNull();
    expect(enderecoDeOrigem("knhenchgntttraaeewlj/public/menu-images/a.png", "?lixo=1")).toBe(
      "https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/public/menu-images/a.png",
    );
  });
});

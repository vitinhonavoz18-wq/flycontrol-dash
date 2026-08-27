import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_BYTES,
  conferirConteudo,
  conferirEndereco,
  hostsPermitidos,
} from "./mediaGuard";

const PERMITIDOS = ["projeto.supabase.co", "cdn.flycontrol.app"];

describe("de onde o servidor pode buscar a arte", () => {
  it("aceita o armazenamento do próprio sistema", () => {
    const r = conferirEndereco(
      "https://projeto.supabase.co/storage/v1/object/public/status-arts/a/b.png",
      PERMITIDOS,
    );
    expect(r.ok).toBe(true);
  });

  it("aceita subdomínio de host autorizado", () => {
    expect(conferirEndereco("https://img.cdn.flycontrol.app/arte.png", PERMITIDOS).ok).toBe(true);
  });

  it("recusa qualquer endereço fora da lista", () => {
    // Sem isto, o endereço da arte viraria um controle remoto do nosso
    // servidor: ele buscaria o que mandassem, de onde mandassem.
    expect(conferirEndereco("https://servidor-qualquer.com/arte.png", PERMITIDOS)).toEqual({
      ok: false,
      motivo: "endereco_nao_autorizado",
    });
  });

  it("recusa a própria máquina e a rede interna", () => {
    // É como pedir ao entregador para buscar um envelope dentro do cofre do
    // escritório: ele TEM a chave, e é justamente por isso que não pode.
    const internos = [
      "https://localhost/arte.png",
      "https://127.0.0.1/arte.png",
      "https://0.0.0.0/arte.png",
      "https://10.0.0.5/arte.png",
      "https://192.168.1.10/arte.png",
      "https://172.16.4.4/arte.png",
      "https://169.254.169.254/latest/meta-data/",
    ];
    for (const url of internos) {
      expect(conferirEndereco(url, PERMITIDOS).ok, url).toBe(false);
    }
  });

  it("recusa o truque do host embutido no usuário", () => {
    // https://projeto.supabase.co@servidor-mau/ parece confiável e não é: o
    // host de verdade é o que vem DEPOIS do arroba.
    const r = conferirEndereco("https://projeto.supabase.co@servidor-mau.com/x.png", PERMITIDOS);
    expect(r.ok).toBe(false);
  });

  it("recusa o que não é https", () => {
    for (const url of [
      "http://projeto.supabase.co/arte.png",
      "file:///etc/passwd",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
    ]) {
      expect(conferirEndereco(url, PERMITIDOS).ok, url).toBe(false);
    }
  });

  it("recusa vazio e lixo", () => {
    for (const url of ["", "   ", null, undefined, "não é url"]) {
      expect(conferirEndereco(url, PERMITIDOS).ok).toBe(false);
    }
  });

  it("sem lista configurada, nada passa", () => {
    // Padrão seguro: variável de ambiente esquecida vira porta fechada, e
    // não porta escancarada.
    expect(conferirEndereco("https://projeto.supabase.co/arte.png", []).ok).toBe(false);
    expect(conferirEndereco("https://servidor-qualquer.com/arte.png", []).ok).toBe(false);
  });
});

describe("lista de armazenamentos autorizados", () => {
  it("sai do endereço do Supabase configurado", () => {
    expect(hostsPermitidos({ SUPABASE_URL: "https://abc123.supabase.co" })).toContain(
      "abc123.supabase.co",
    );
  });

  it("inclui sempre o armazenamento das artes que vêm de fábrica", () => {
    // Sem isto o porteiro recusaria a própria imagem padrão do FlyControl,
    // que mora num armazenamento diferente do banco atual.
    expect(hostsPermitidos({})).toContain("laufyadcizmruejafcpi.supabase.co");
  });

  it("aceita hosts extras separados por vírgula", () => {
    const lista = hostsPermitidos({
      SUPABASE_URL: "https://abc123.supabase.co",
      FLYSTATUS_MEDIA_HOSTS: "cdn.flycontrol.app, imagens.exemplo.com",
    });
    expect(lista).toContain("cdn.flycontrol.app");
    expect(lista).toContain("imagens.exemplo.com");
  });

  it("variável mal preenchida não derruba nada", () => {
    expect(hostsPermitidos({ SUPABASE_URL: "isso não é uma url" })).not.toContain(undefined);
  });
});

describe("o que voltou é mesmo uma imagem", () => {
  it("aceita JPG, PNG e WebP", () => {
    for (const tipo of ["image/jpeg", "image/png", "image/webp"]) {
      expect(conferirConteudo(tipo, 1000).ok, tipo).toBe(true);
    }
  });

  it("ignora o resto do cabeçalho", () => {
    expect(conferirConteudo("image/png; charset=binary", 1000).ok).toBe(true);
  });

  it("recusa página de erro, JSON e HTML", () => {
    // O caso real: o endereço quebrou, o armazenamento devolveu uma página de
    // erro, e sem esta trava essa página sairia como "arte" para o cliente.
    for (const tipo of ["text/html", "application/json", "text/plain", null, ""]) {
      expect(conferirConteudo(tipo, 1000).ok).toBe(false);
    }
  });

  it("recusa arquivo vazio e arquivo grande demais", () => {
    expect(conferirConteudo("image/png", 0)).toEqual({ ok: false, motivo: "vazia" });
    expect(conferirConteudo("image/png", TAMANHO_MAXIMO_BYTES + 1)).toEqual({
      ok: false,
      motivo: "muito_grande",
    });
    expect(conferirConteudo("image/png", TAMANHO_MAXIMO_BYTES).ok).toBe(true);
  });
});

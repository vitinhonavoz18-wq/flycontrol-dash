import { describe, expect, it } from "vitest";
import {
  tamanhoLegivel,
  duracaoLegivel,
  escolherFormato,
  mimeLimpo,
  FORMATOS_DE_GRAVACAO,
} from "./midiaNavegador";

describe("o que o lojista lê na tela", () => {
  it("mostra o tamanho do jeito que gente lê", () => {
    expect(tamanhoLegivel(900)).toBe("900 B");
    expect(tamanhoLegivel(1536)).toBe("2 KB");
    expect(tamanhoLegivel(3 * 1024 * 1024)).toBe("3,0 MB");
  });

  it("mostra a duração como o WhatsApp mostra", () => {
    expect(duracaoLegivel(0)).toBe("0:00");
    expect(duracaoLegivel(9)).toBe("0:09");
    expect(duracaoLegivel(75)).toBe("1:15");
    expect(duracaoLegivel(-5)).toBe("0:00");
  });
});

describe("o formato da gravação", () => {
  it("usa o primeiro que o aparelho aceita", () => {
    expect(escolherFormato((m) => m === "audio/mp4")).toBe("audio/mp4");
  });

  it("prefere a melhor opção quando o aparelho aceita várias", () => {
    expect(escolherFormato(() => true)).toBe(FORMATOS_DE_GRAVACAO[0]);
  });

  // Navegador que não grava nada precisa dizer isso ANTES: é a diferença entre
  // avisar "seu navegador não grava áudio" e deixar o lojista falar um minuto
  // para um arquivo que não vai existir.
  it("devolve nulo quando o aparelho não grava áudio nenhum", () => {
    expect(escolherFormato(() => false)).toBeNull();
  });

  it("não deixa um navegador que explode derrubar a escolha", () => {
    let primeira = true;
    const aceita = (m: string) => {
      if (primeira) {
        primeira = false;
        throw new Error("navegador antigo");
      }
      return m === FORMATOS_DE_GRAVACAO[1];
    };
    expect(escolherFormato(aceita)).toBe(FORMATOS_DE_GRAVACAO[1]);
  });

  it("tira o codec pendurado do tipo do arquivo", () => {
    expect(mimeLimpo("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(mimeLimpo("IMAGE/JPEG")).toBe("image/jpeg");
  });
});

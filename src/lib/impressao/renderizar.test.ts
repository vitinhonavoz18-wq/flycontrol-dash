import { describe, expect, it } from "vitest";
import type { Linha } from "./comanda";
import { comandaDeExemplo, testeDeAlinhamento } from "./exemplos";
import { perfilPadrao } from "./perfil";
import {
  COMANDOS,
  codificar,
  escaparHtml,
  paraBase64,
  paraEscPos,
  paraHtml,
  paraTexto,
} from "./renderizar";

const L = (texto: string, estilo: Linha["estilo"] = "normal"): Linha => ({ texto, estilo });

function contem(bytes: Uint8Array, trecho: readonly number[]): boolean {
  outer: for (let i = 0; i + trecho.length <= bytes.length; i++) {
    for (let j = 0; j < trecho.length; j++) if (bytes[i + j] !== trecho[j]) continue outer;
    return true;
  }
  return false;
}

describe("texto puro", () => {
  it("uma linha por linha, com a quebra escolhida", () => {
    expect(paraTexto([L("a"), L("b")])).toBe("a\nb\n");
    expect(paraTexto([L("a"), L("b")], "crlf")).toBe("a\r\nb\r\n");
  });
});

describe("ESC/POS (pronto para envio direto — ainda não ligado)", () => {
  it("começa reiniciando a impressora e escolhendo a tabela de acentos", () => {
    const b = paraEscPos([L("oi")], perfilPadrao("80"));
    expect(Array.from(b.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 3]); // CP860
  });

  it("cada linha termina em LF (0x0A) e nunca em CR sozinho", () => {
    const b = paraEscPos([L("a"), L("b")], { ...perfilPadrao("80"), cortarPapel: false });
    expect(b.includes(0x0d)).toBe(false);
    expect(Array.from(b.slice(-4))).toEqual([0x61, 0x0a, 0x62, 0x0a]);
  });

  it("acentos viram os bytes da tabela CP860 e da CP850", () => {
    expect(codificar("ção", "cp860")).toEqual([0x87, 0x84, 0x6f]);
    expect(codificar("ção", "cp850")).toEqual([0x87, 0xc6, 0x6f]);
  });

  it("sem acentos: só letras simples, sem comando de tabela", () => {
    const perfil = { ...perfilPadrao("80"), acentos: false };
    const b = paraEscPos([L("Atenção")], perfil);
    expect(contem(b, [0x1b, 0x74])).toBe(false);
    expect(
      contem(
        b,
        Array.from("Atencao", (c) => c.charCodeAt(0)),
      ),
    ).toBe(true);
  });

  it("letra que não existe na tabela vira a versão sem acento ou '?'", () => {
    expect(codificar("ŝ", "cp860")).toEqual([0x73]);
    expect(codificar("中", "cp860")).toEqual([0x3f]);
  });

  it("título em altura dupla, sem largura dupla (não quebra a linha)", () => {
    const b = paraEscPos([L("TOTAL", "titulo")], perfilPadrao("80"));
    expect(contem(b, [0x1b, 0x21, 0x18])).toBe(true);
    expect(contem(b, [0x1b, 0x21, 0x20])).toBe(false);
    expect(contem(b, [0x1b, 0x21, 0x00])).toBe(true);
  });

  it("negrito liga e desliga em volta da linha", () => {
    const b = paraEscPos([L("OBS", "destaque")], perfilPadrao("80"));
    expect(contem(b, [0x1b, 0x45, 1, 0x4f, 0x42, 0x53, 0x0a, 0x1b, 0x45, 0])).toBe(true);
  });

  it("corte e gaveta só quando pedidos", () => {
    const base = perfilPadrao("80");
    expect(contem(paraEscPos([L("x")], base), COMANDOS.cortar)).toBe(true);
    expect(contem(paraEscPos([L("x")], base), COMANDOS.gaveta)).toBe(false);
    const semCorte = paraEscPos([L("x")], { ...base, cortarPapel: false, abrirGaveta: true });
    expect(contem(semCorte, COMANDOS.cortar)).toBe(false);
    expect(contem(semCorte, COMANDOS.gaveta)).toBe(true);
  });

  it("a comanda inteira vira base64 válido (formato aceito por serviços como o PrintNode)", () => {
    const perfil = perfilPadrao("58");
    const bytes = paraEscPos(comandaDeExemplo(perfil), perfil);
    const b64 = paraBase64(bytes);
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const volta = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(volta)).toEqual(Array.from(bytes));
  });

  it("nenhuma linha impressa passa das colunas do perfil (contando bytes entre LFs)", () => {
    const perfil = perfilPadrao("58");
    const bytes = paraEscPos(comandaDeExemplo(perfil), perfil);
    // Tira os comandos (ESC x y / GS x y z) e mede o texto entre quebras.
    const semComandos: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x1b) {
        i += bytes[i + 1] === 0x70 ? 4 : bytes[i + 1] === 0x40 ? 1 : 2;
        continue;
      }
      if (bytes[i] === 0x1d) {
        i += 3;
        continue;
      }
      semComandos.push(bytes[i]);
    }
    const linhas = String.fromCharCode(...semComandos).split("\n");
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(perfil.colunas);
  });
});

describe("HTML para a janela de impressão", () => {
  it("texto do cliente nunca vira código na página", () => {
    const html = paraHtml([L('<img src=x onerror="alert(1)">')], perfilPadrao("80"));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toMatch(/<script/i);
  });

  it("logo só entra com endereço http(s) comum", () => {
    const p = perfilPadrao("80");
    expect(paraHtml([L("x")], p, { logoUrl: "https://exemplo.com/logo.png" })).toContain(
      'src="https://exemplo.com/logo.png"',
    );
    expect(paraHtml([L("x")], p, { logoUrl: "javascript:alert(1)" })).not.toContain("javascript:");
    expect(
      paraHtml([L("x")], { ...p, mostrarLogo: false }, { logoUrl: "https://e.com/l.png" }),
    ).not.toContain("<img");
  });

  it("cada linha vira um bloco próprio, na fonte de largura fixa", () => {
    const perfil = perfilPadrao("58");
    const linhas = testeDeAlinhamento(perfil);
    const html = paraHtml(linhas, perfil);
    expect(html.match(/<div class="l l-/g)).toHaveLength(linhas.length);
    expect(html).toContain("white-space: pre");
    expect(html).toContain('"Courier New"');
    expect(html).toContain('<meta charset="utf-8">');
  });

  it("a letra é calculada para as colunas caberem no papel", () => {
    const html58 = paraHtml([L("x")], perfilPadrao("58"));
    // (52 - 2×2) / (32 × 0,612) = 2,451 mm
    expect(html58).toContain("font-size: 2.451mm");
    const htmlAuto = paraHtml([L("x")], perfilPadrao("auto"));
    expect(htmlAuto).toMatch(/font-size: calc\(\(min\(100vw, 76mm\) - 6mm\) \/ 25\.7040\)/);
  });

  it("escapa os cinco caracteres perigosos", () => {
    expect(escaparHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

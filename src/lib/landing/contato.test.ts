import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INSTAGRAM_LINK, INSTAGRAM_VISIVEL, WHATSAPP_LINK, WHATSAPP_VISIVEL } from "./contato";

/**
 * Guardas do contato da plataforma.
 *
 * O erro que este teste existe para pegar é o mais silencioso de todos: o
 * número ESCRITO no rodapé mudar e o número do LINK continuar o antigo. A
 * página fica bonita, ninguém percebe nada, e o cliente que clica cai numa
 * conversa com um número que não é o seu — enquanto o que ele leu na tela
 * estava certo.
 *
 * É a placa da porta dizendo um telefone e o cartão de visita dizendo outro.
 */

describe("contato da plataforma", () => {
  it("o número escrito é o mesmo número do link", () => {
    const doLink = WHATSAPP_LINK.match(/wa\.me\/(\d+)/)?.[1];
    const escrito = WHATSAPP_VISIVEL.replace(/\D/g, "");
    expect(doLink).toBeDefined();
    // O link carrega o 55 do Brasil na frente; o que a pessoa lê, não.
    expect(doLink).toBe(`55${escrito}`);
  });

  it("o link do WhatsApp está no formato que o app entende", () => {
    // wa.me só aceita dígitos: nada de espaço, parêntese ou traço.
    expect(WHATSAPP_LINK).toMatch(/^https:\/\/wa\.me\/\d{12,13}\?text=/);
  });

  it("a conversa já abre com uma frase pronta", () => {
    const texto = decodeURIComponent(WHATSAPP_LINK.split("?text=")[1] ?? "");
    expect(texto.length).toBeGreaterThan(10);
    expect(texto).toContain("FlyControl");
  });

  it("o Instagram aponta para o perfil escrito", () => {
    expect(INSTAGRAM_VISIVEL.startsWith("@")).toBe(true);
    expect(INSTAGRAM_LINK).toBe(`https://instagram.com/${INSTAGRAM_VISIVEL.slice(1)}`);
  });

  it("nenhuma tela escreve o contato na mão — todas puxam daqui", () => {
    const paginas = ["src/components/landing/SiteFooter.tsx", "src/routes/index.tsx"];
    for (const caminho of paginas) {
      const conteudo = readFileSync(join(process.cwd(), caminho), "utf8");
      expect(conteudo).not.toContain("wa.me/");
      expect(conteudo).not.toContain("99937-3863");
      expect(conteudo).not.toContain("flycontrolofc");
    }
  });

  it("os links de fora abrem em outra aba, sem dar acesso à página", () => {
    const rodape = readFileSync(
      join(process.cwd(), "src/components/landing/SiteFooter.tsx"),
      "utf8",
    );
    const botao = readFileSync(
      join(process.cwd(), "src/components/landing/BotaoWhatsApp.tsx"),
      "utf8",
    );
    // Sem `noopener`, a aba que abre consegue mexer na aba de origem — é
    // deixar a chave da loja com quem só veio entregar um panfleto.
    for (const [nome, arquivo] of [
      ["rodapé", rodape],
      ["botão", botao],
    ] as const) {
      const aberturas = arquivo.match(/target="_blank"/g)?.length ?? 0;
      const protecoes = arquivo.match(/rel="noopener noreferrer"/g)?.length ?? 0;
      expect(aberturas, `${nome}: abre aba nova sem proteção`).toBe(protecoes);
      expect(aberturas).toBeGreaterThan(0);
    }
  });
});

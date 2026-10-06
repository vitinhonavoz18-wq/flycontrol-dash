import { describe, expect, it } from "vitest";
import {
  DESCRICAO,
  ROTA_DA_PAGINA,
  TITULO,
  cabecalhoDaPagina,
  lerPermissaoDeIndexar,
  normalizarUrl,
} from "./site";

/**
 * O cabeçalho da página FlyDelivery Parceiros.
 *
 * O teste mais importante é o primeiro: enquanto a página estiver em teste,
 * ela NÃO pode aparecer no Google. Se alguém mexer no padrão sem querer,
 * este teste acusa antes de ir para o ar.
 */

function valorDaMeta(meta: Record<string, string>[], chave: string) {
  return meta.find((m) => m.name === chave || m.property === chave)?.content;
}

describe("Google: em teste, a página não é indexada", () => {
  it("sem configuração nenhuma, pede para não indexar nem seguir links", () => {
    const { meta } = cabecalhoDaPagina({ url: "https://exemplo.com.br", indexar: false });
    expect(valorDaMeta(meta, "robots")).toBe("noindex, nofollow");
  });

  it("só libera o Google quando a chave diz exatamente 'sim'", () => {
    expect(lerPermissaoDeIndexar("sim")).toBe(true);
    expect(lerPermissaoDeIndexar(" SIM ")).toBe(true);
    for (const valor of [undefined, null, "", "true", "1", "yes", "nao", "simm"]) {
      expect(lerPermissaoDeIndexar(valor)).toBe(false);
    }
    const { meta } = cabecalhoDaPagina({ url: "https://exemplo.com.br", indexar: true });
    expect(valorDaMeta(meta, "robots")).toBe("index, follow");
  });
});

describe("endereço e prévia do link", () => {
  it("o endereço oficial (canonical) é o configurado, sem barra no fim", () => {
    const { links, meta } = cabecalhoDaPagina({ url: "https://parceiros.exemplo.com.br/ " });
    expect(links.find((l) => l.rel === "canonical")?.href).toBe("https://parceiros.exemplo.com.br");
    expect(valorDaMeta(meta, "og:url")).toBe("https://parceiros.exemplo.com.br");
  });

  it("a imagem da prévia tem endereço completo, na raiz do domínio", () => {
    const { meta } = cabecalhoDaPagina({ url: "https://exemplo.com.br/flydelivery-parceiros" });
    expect(valorDaMeta(meta, "og:image")).toBe(
      "https://exemplo.com.br/flydelivery-parceiros/og-image.jpg",
    );
    expect(valorDaMeta(meta, "twitter:image")).toBe(valorDaMeta(meta, "og:image"));
  });

  it("sem endereço configurado, usa o domínio atual com a rota da página", () => {
    expect(normalizarUrl(undefined)).toBe(`https://flycontrol.conectfly.com.br${ROTA_DA_PAGINA}`);
    expect(normalizarUrl("   ")).toBe(`https://flycontrol.conectfly.com.br${ROTA_DA_PAGINA}`);
  });

  it("título e descrição são os combinados", () => {
    const { meta } = cabecalhoDaPagina();
    expect(meta.find((m) => m.title)?.title).toBe(TITULO);
    expect(TITULO).toBe("FlyDelivery Parceiros | Gestão completa para delivery");
    expect(valorDaMeta(meta, "description")).toBe(DESCRICAO);
    expect(valorDaMeta(meta, "og:title")).toBe(TITULO);
  });
});

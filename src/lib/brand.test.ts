import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND, BRAND_TRANSITION, shouldShowBrandTransitionNotice } from "./brand";

/**
 * Guardas da troca de marca (FlyControl → FlyDelivery).
 *
 * Duas coisas podem dar errado numa troca de nome, e são opostas:
 *
 *   1. sobrar o nome antigo numa tela — o cliente vê duas marcas e desconfia;
 *   2. trocar o nome de algo que OUTRO sistema usa para nos achar — o site de
 *      pedidos bate numa porta que não existe mais e o pedido não entra.
 *
 * Os testes abaixo seguram as duas pontas.
 */

describe("a marca nova", () => {
  it("o nome oficial é FlyDelivery e o antigo fica só como referência", () => {
    expect(BRAND.name).toBe("FlyDelivery");
    expect(BRAND.legacyName).toBe("FlyControl");
  });

  it("o aplicativo instalável usa o nome e as cores novas", () => {
    const manifesto = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifesto.name).toBe(BRAND.name);
    expect(manifesto.short_name).toBe(BRAND.name);
    expect(manifesto.theme_color.toLowerCase()).toBe(BRAND.themeColor.toLowerCase());
    expect(manifesto.background_color.toLowerCase()).toBe(BRAND.backgroundColor.toLowerCase());
  });

  it("os arquivos da marca existem onde as telas esperam", () => {
    for (const arquivo of [
      "public/favicon.svg",
      "public/favicon.ico",
      "public/flydelivery-social-preview.jpg",
      "public/brand/flydelivery-icone.svg",
      "public/brand/flydelivery-letreiro.svg",
      "public/brand/flydelivery-letreiro-fundo-escuro.svg",
      "public/brand/flydelivery-simbolo.png",
      "public/brand/flydelivery-logo-fundo-claro.png",
      "public/brand/flydelivery-logo-fundo-escuro.png",
      "public/icons/icon-192.png",
      "public/icons/icon-512.png",
      "public/icons/icon-192-maskable.png",
      "public/icons/icon-512-maskable.png",
      "public/icons/icon-apple-touch.png",
      "src/assets/brand/flydelivery-simbolo.webp",
    ]) {
      expect(readFileSync(arquivo).length, arquivo).toBeGreaterThan(200);
    }
  });

  it("a tela sem conexão e a página raiz não citam mais a marca antiga", () => {
    expect(readFileSync("public/offline.html", "utf8")).not.toMatch(/Fly ?Control/);
    const raiz = readFileSync("src/routes/__root.tsx", "utf8");
    // Comentário pode contar a história; o que vai para a tela, não.
    const semComentarios = raiz.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/Fly ?Control/);
  });

  it("quem já tinha o app instalado recebe os ícones novos", () => {
    // Os ícones novos têm o mesmo endereço dos antigos e são guardados "para
    // sempre" no aparelho. Só a troca da versão do cache faz o aparelho
    // buscar de novo. Voltar para a v1 traria a logo velha de volta.
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('const CACHE_VERSION = "flycontrol-v2"');
    // O prefixo continua o antigo: é por ele que a limpeza acha o cache velho.
    expect(sw).toContain('key.startsWith("flycontrol-")');
  });
});

describe("o que NÃO pode mudar de nome", () => {
  // Estes nomes são portas por onde outros sistemas entram, ou gavetas onde o
  // navegador do cliente já guardou coisas. Renomear qualquer um quebra algo
  // que hoje funciona — sem ninguém ver, até um pedido deixar de chegar.

  it("o aviso de mesa fechada continua batendo no endereço que o site de pedidos conhece", () => {
    expect(readFileSync("src/lib/notifyTableClosed.functions.ts", "utf8")).toContain(
      "/api/public/flycontrol-table-closed",
    );
  });

  it("o endereço público do painel continua vindo da mesma variável do servidor", () => {
    expect(readFileSync("src/integrations/sitecreatorfly/provision.server.ts", "utf8")).toContain(
      "FLYCONTROL_PUBLIC_URL",
    );
    expect(readFileSync(".env.example", "utf8")).toContain("FLYCONTROL_PUBLIC_URL=");
  });

  it("as preferências já guardadas no navegador do lojista continuam valendo", () => {
    // Trocar estas chaves faria todo lojista perder o tema escolhido, o som
    // ligado e o tamanho do papel — e derrubaria o login dos garçons.
    expect(readFileSync("src/components/theme-provider.tsx", "utf8")).toContain(
      '"flycontrol-theme"',
    );
    expect(readFileSync("src/routes/_app/dashboard.tsx", "utf8")).toContain(
      '"flycontrol_sound_on"',
    );
    expect(readFileSync("src/lib/waiterSession.ts", "utf8")).toContain(
      '"flycontrol.waiterSession.v1"',
    );
    expect(readFileSync("src/lib/impressao/papel.ts", "utf8")).toContain(
      '"flycontrol:papel-da-comanda"',
    );
  });

  it("a origem técnica do pedido do aplicativo continua 'flydelivery'", () => {
    // O rótulo na tela virou "App FlyDelivery"; o código gravado no banco não.
    expect(readFileSync("src/components/orders/orderDisplay.ts", "utf8")).toContain(
      'flydelivery: "App FlyDelivery"',
    );
  });
});

describe("o aviso de transição", () => {
  const antes = "2026-05-02T12:00:00Z"; // conta antiga
  const depois = "2026-12-01T12:00:00Z"; // conta criada já na marca nova
  const noPeriodo = new Date("2026-12-15T15:00:00Z");

  it("aparece para quem já era cliente, durante o período", () => {
    expect(
      shouldShowBrandTransitionNotice({ now: noPeriodo, userCreatedAt: antes, dismissed: false }),
    ).toBe(true);
  });

  it("não aparece para quem criou a conta depois da troca", () => {
    expect(
      shouldShowBrandTransitionNotice({ now: noPeriodo, userCreatedAt: depois, dismissed: false }),
    ).toBe(false);
  });

  it("não volta depois que a pessoa fecha", () => {
    expect(
      shouldShowBrandTransitionNotice({ now: noPeriodo, userCreatedAt: antes, dismissed: true }),
    ).toBe(false);
  });

  it("some sozinho depois do último dia", () => {
    const ultimoDia = new Date(`${BRAND_TRANSITION.noticeUntil}T20:00:00-03:00`);
    const diaSeguinte = new Date(`${BRAND_TRANSITION.noticeUntil}T23:59:59-03:00`);
    diaSeguinte.setSeconds(diaSeguinte.getSeconds() + 2);
    expect(
      shouldShowBrandTransitionNotice({ now: ultimoDia, userCreatedAt: antes, dismissed: false }),
    ).toBe(true);
    expect(
      shouldShowBrandTransitionNotice({ now: diaSeguinte, userCreatedAt: antes, dismissed: false }),
    ).toBe(false);
  });

  it("na dúvida (sem data de criação ou data inválida), não mostra", () => {
    for (const userCreatedAt of [null, undefined, "", "não é data"]) {
      expect(
        shouldShowBrandTransitionNotice({ now: noPeriodo, userCreatedAt, dismissed: false }),
      ).toBe(false);
    }
  });

  it("o texto é o combinado e o período é coerente", () => {
    expect(BRAND_TRANSITION.title).toBe("O FlyControl evoluiu. Agora somos FlyDelivery.");
    expect(BRAND_TRANSITION.message).toContain("continuam aqui");
    expect(new Date(BRAND_TRANSITION.noticeUntil).getTime()).toBeGreaterThan(
      new Date(BRAND_TRANSITION.launchedAt).getTime(),
    );
  });
});

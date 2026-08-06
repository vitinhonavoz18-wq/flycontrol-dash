import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PENDING_PRIVACY_SECTIONS, PRIVACY_VERSION } from "./privacy";
import { PENDING_LEGAL_SECTIONS, TERMS_VERSION } from "./terms";

/**
 * O aceite é um registro que precisa provar algo depois: a que textos o
 * cliente consentiu, e que ele teve como lê-los antes de marcar a caixinha.
 * As garantias vivem em arquivos diferentes e são fáceis de quebrar sem
 * perceber, então ficam travadas aqui.
 */
const signupPage = readFileSync("src/routes/signup.tsx", "utf8");
const signupServer = readFileSync("src/lib/signup/signup.functions.ts", "utf8");
const privacyPage = readFileSync("src/routes/privacy.tsx", "utf8");

describe("versionamento dos documentos", () => {
  it.each([
    ["termos", TERMS_VERSION],
    ["privacidade", PRIVACY_VERSION],
  ])("a versão de %s usa um formato ordenável por data", (_doc, version) => {
    // Sem ordenação, saber qual de duas versões é a mais recente vira
    // arqueologia de git.
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("mantém visível o que ainda falta em cada documento", () => {
    expect(PENDING_LEGAL_SECTIONS.length).toBeGreaterThan(0);
    expect(PENDING_PRIVACY_SECTIONS.length).toBeGreaterThan(0);
  });
});

describe("links dos documentos no cadastro", () => {
  const links = [
    ["termos", 'to="/terms"'],
    ["política de privacidade", 'to="/privacy"'],
  ] as const;

  it.each(links)("o link de %s aparece acima da caixinha de aceite", (_doc, marker) => {
    // A exigência é posicional: ler precisa ser o passo anterior a aceitar,
    // e não um detalhe escondido depois da caixinha.
    const link = signupPage.indexOf(marker);
    const checkbox = signupPage.indexOf('type="checkbox"');

    expect(link).toBeGreaterThan(-1);
    expect(checkbox).toBeGreaterThan(-1);
    expect(link).toBeLessThan(checkbox);
  });

  it.each(links)("o link de %s abre em nova aba para não descartar o wizard", (_doc, marker) => {
    // Navegar na mesma aba apagaria tudo o que já foi preenchido nas quatro
    // etapas.
    const link = signupPage.slice(signupPage.indexOf(marker), signupPage.indexOf(marker) + 250);
    expect(link).toContain('target="_blank"');
    expect(link).toContain("noopener");
  });

  it.each(links)("o link de %s fica fora do rótulo clicável", (_doc, marker) => {
    // Um link dentro do <label> faz o toque no celular marcar o aceite sem
    // querer, ou abrir o documento ao tentar marcar.
    const label = signupPage.slice(
      signupPage.indexOf('<label className="flex cursor-pointer items-start'),
    );
    const labelEnd = label.indexOf("</label>");
    expect(label.slice(0, labelEnd)).not.toContain(marker);
  });
});

describe("a política não afirma mais do que o código faz", () => {
  it("declara ausência de rastreadores, e o código não tem nenhum", () => {
    // A página afirma que não há Google Analytics, Meta Pixel ou
    // equivalente. Se alguém adicionar um, a afirmação vira mentira — e é
    // exatamente o tipo de mudança que ninguém lembra de refletir no texto.
    expect(privacyPage).toContain("Google Analytics");

    const pkg = readFileSync("package.json", "utf8");
    const trackers = [
      "gtag",
      "google-analytics",
      "react-ga",
      "posthog",
      "mixpanel",
      "amplitude",
      "hotjar",
      "@sentry/",
      "react-facebook-pixel",
    ];
    for (const tracker of trackers) {
      expect(pkg, `dependência de rastreamento encontrada: ${tracker}`).not.toContain(tracker);
    }
  });

  it("assume a retenção indefinida em vez de publicar um prazo que não existe", () => {
    // Não há rotina de descarte no sistema. Publicar prazo seria declarar
    // uma conformidade inexistente.
    expect(privacyPage).toContain("prazo indeterminado");
  });

  it("separa o papel de operador do de controlador", () => {
    // Sem essa distinção, a política prometeria em nome do estabelecimento
    // decisões que não são da FlyControl.
    expect(privacyPage).toMatch(/quem os coleta e decide o que fazer com eles é o/i);
  });
});

describe("registro do consentimento", () => {
  it("grava as versões aceitas junto do cadastro", () => {
    expect(signupServer).toContain("accepted_terms_version");
    expect(signupServer).toContain("accepted_privacy_version");
    expect(signupServer).toContain("accepted_terms_at");
  });

  it("recusa aceite de uma versão que não é mais a vigente", () => {
    // Aba aberta antes de uma publicação nova: registrar como se fosse a
    // versão atual tornaria o consentimento inútil.
    expect(signupServer).toContain("d.termsVersion !== TERMS_VERSION");
    expect(signupServer).toContain("d.privacyVersion !== PRIVACY_VERSION");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PENDING_LEGAL_SECTIONS, TERMS_VERSION } from "./terms";

/**
 * O aceite dos termos é um registro que precisa provar algo depois: a que
 * texto o cliente consentiu, e que ele teve como ler esse texto antes de
 * marcar a caixinha. As duas garantias vivem em arquivos diferentes e são
 * fáceis de quebrar sem perceber, então ficam travadas aqui.
 */
const signupPage = readFileSync("src/routes/signup.tsx", "utf8");
const signupServer = readFileSync("src/lib/signup/signup.functions.ts", "utf8");

describe("versão dos termos", () => {
  it("usa um formato ordenável por data", () => {
    // Sem ordenação, saber qual de duas versões é a mais recente vira
    // arqueologia de git.
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("mantém visível o que ainda falta de redação jurídica", () => {
    expect(PENDING_LEGAL_SECTIONS.length).toBeGreaterThan(0);
  });
});

describe("link dos termos no cadastro", () => {
  it("aparece acima da caixinha de aceite", () => {
    // A exigência é posicional: o link precisa vir antes do checkbox, para
    // que ler seja o passo anterior a aceitar, e não um detalhe escondido
    // depois dele.
    const link = signupPage.indexOf('to="/terms"');
    const checkbox = signupPage.indexOf('type="checkbox"');

    expect(link).toBeGreaterThan(-1);
    expect(checkbox).toBeGreaterThan(-1);
    expect(link).toBeLessThan(checkbox);
  });

  it("abre em nova aba para não descartar o wizard", () => {
    // Navegar para os termos na mesma aba apagaria tudo o que já foi
    // preenchido nas quatro etapas.
    const link = signupPage.slice(signupPage.indexOf('to="/terms"'));
    expect(link.slice(0, 200)).toContain('target="_blank"');
    expect(link.slice(0, 200)).toContain("noopener");
  });

  it("não coloca o link dentro do rótulo clicável", () => {
    // Um link dentro do <label> faz o toque no celular marcar o aceite sem
    // querer, ou abrir os termos ao tentar marcar.
    const label = signupPage.slice(
      signupPage.indexOf('<label className="flex cursor-pointer items-start'),
    );
    const labelEnd = label.indexOf("</label>");
    expect(label.slice(0, labelEnd)).not.toContain('to="/terms"');
  });
});

describe("registro do consentimento", () => {
  it("grava a versão aceita junto do cadastro", () => {
    expect(signupServer).toContain("accepted_terms_version");
    expect(signupServer).toContain("accepted_terms_at");
  });

  it("recusa aceite de uma versão que não é mais a vigente", () => {
    // Aba aberta antes de uma publicação nova: registrar como se fosse a
    // versão atual tornaria o consentimento inútil.
    expect(signupServer).toContain("d.termsVersion !== TERMS_VERSION");
  });
});

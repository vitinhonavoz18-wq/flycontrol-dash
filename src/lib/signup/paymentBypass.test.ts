import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAYMENT_BYPASS_ENV_VAR, isPaymentBypassAllowed } from "./paymentBypass";

/**
 * Este atalho cria contas ativas sem pagamento. Ligado por engano em
 * produção, ele é um botão de "assine grátis" na página pública de cadastro.
 * Os testes aqui existem para que isso não aconteça por descuido.
 */
const signupServer = readFileSync("src/lib/signup/signup.functions.ts", "utf8");
const signupPage = readFileSync("src/routes/signup.tsx", "utf8");
const envExample = readFileSync(".env.example", "utf8");

describe("permissão do atalho", () => {
  it("fica desligado sem configuração", () => {
    expect(isPaymentBypassAllowed({})).toBe(false);
  });

  it("não liga com valores parecidos com sim", () => {
    // "1", "yes" e afins são o tipo de valor que alguém escreve achando que
    // liga alguma coisa — e aqui ligar sem querer custa caro.
    for (const value of ["1", "yes", "sim", "on", "TRUE!", " "]) {
      expect(isPaymentBypassAllowed({ [PAYMENT_BYPASS_ENV_VAR]: value })).toBe(false);
    }
  });

  it("liga apenas com o valor exato", () => {
    expect(isPaymentBypassAllowed({ [PAYMENT_BYPASS_ENV_VAR]: "true" })).toBe(true);
    expect(isPaymentBypassAllowed({ [PAYMENT_BYPASS_ENV_VAR]: " TRUE " })).toBe(true);
  });
});

describe("o servidor não confia no navegador", () => {
  it("reconfere a permissão em vez de aceitar o pedido do cliente", () => {
    // Sem esta segunda checagem, bastaria forjar a requisição com
    // bypassPayment: true para criar conta ativa de graça.
    expect(signupServer).toContain(
      "data.bypassPayment === true && isPaymentBypassAllowed(process.env)",
    );
  });

  it("marca a conta como não paga na auditoria", () => {
    // É o que permite achar essas contas depois para limpar ou cobrar.
    expect(signupServer).toContain("payment_bypassed: bypassPayment");
    expect(signupServer).toContain("subscription_created_test_bypass");
  });

  it("não cria intenção de checkout quando pula o pagamento", () => {
    // Uma intenção pendente para uma conta que nunca vai pagar só sujaria o
    // registro.
    expect(signupServer).toMatch(/bypassPayment\s*\?\s*null\s*:\s*await createCheckoutIntent/);
  });
});

describe("visibilidade do atalho", () => {
  it("o botão depende da resposta do servidor, não de um valor do bundle", () => {
    // import.meta.env viajaria no bundle publicado; a flag precisa vir do
    // Worker.
    expect(signupPage).toContain("getSignupOptions()");
    expect(signupPage).toContain("bypassAllowed");
    expect(signupPage).not.toContain("import.meta.env.SIGNUP_ALLOW_PAYMENT_BYPASS");
  });

  it("aparece com aviso, e não como um botão comum", () => {
    expect(signupPage).toContain("PAYMENT_BYPASS_WARNING");
  });

  it("continua exigindo o aceite dos termos", () => {
    // O atalho pula o pagamento, não o consentimento.
    const shortcut = signupPage.slice(signupPage.indexOf("bypassPayment: true"));
    expect(shortcut.slice(0, 300)).toContain("!acceptedTerms");
  });
});

describe("documentação", () => {
  it("a variável está no .env.example marcada como temporária", () => {
    // Quem for configurar o ambiente precisa topar com o aviso.
    expect(envExample).toContain(PAYMENT_BYPASS_ENV_VAR);
    expect(envExample).toMatch(/TEMPOR[ÁA]RI[OA]/i);
  });
});

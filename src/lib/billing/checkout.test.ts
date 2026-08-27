import { describe, expect, it } from "vitest";
import {
  CHECKOUT_INTENT_TTL_MS,
  checkoutAmountCents,
  checkoutEnvVar,
  checkoutReturnPath,
  checkoutReturnUrl,
  generateIntentToken,
  hashIntentToken,
  infinityPayWebhookUrl,
  planRequiresUpfrontPayment,
  resolveCheckoutConfig,
  shouldTrustCheckoutReturn,
  validateGatewayConfirmation,
  validateIntentForReturn,
} from "./checkout";
import { PLAN_PRICING } from "./plans";

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

describe("links de retorno", () => {
  it("gera um caminho por plano", () => {
    // É o que permite recusar quem pagou um plano e voltou pelo outro.
    expect(checkoutReturnPath("premium")).toBe("/pagamento/premium");
    expect(checkoutReturnPath("cents")).toBe("/pagamento/cents");
  });

  it("monta a URL absoluta sem barra duplicada", () => {
    // O valor é copiado à mão para o painel da InfinityPay; uma barra a mais
    // vira um 404 depois do pagamento.
    expect(checkoutReturnUrl("https://app.flycontrol.com.br", "premium")).toBe(
      "https://app.flycontrol.com.br/pagamento/premium",
    );
    expect(checkoutReturnUrl("https://app.flycontrol.com.br/", "cents")).toBe(
      "https://app.flycontrol.com.br/pagamento/cents",
    );
  });
});

describe("valor esperado do checkout", () => {
  it("no PREMIUM cobra a mensalidade", () => {
    expect(checkoutAmountCents("premium")).toBe(PLAN_PRICING.premium.monthlyFeeCents);
  });

  it("no CENTS não cobra nada na entrada", () => {
    // Sem taxa de cadastro, não há valor de entrada. O consumo por pedido é
    // faturado no fechamento do ciclo e nunca passa por este checkout.
    expect(checkoutAmountCents("cents")).toBe(0);
    expect(checkoutAmountCents("cents")).not.toBe(PLAN_PRICING.cents.defaultOrderUnitPriceCents);
  });

  it("diz quem precisa passar pelo checkout antes de ser liberado", () => {
    // É o que impede mandar alguém para uma tela de pagamento de R$ 0,00.
    expect(planRequiresUpfrontPayment("premium")).toBe(true);
    expect(planRequiresUpfrontPayment("cents")).toBe(false);
  });
});

describe("configuração da URL de checkout", () => {
  it("fica desconfigurada enquanto a variável estiver vazia", () => {
    // Estado esperado até os links da InfinityPay existirem: o cadastro segue
    // pelo fluxo manual em vez de quebrar.
    const config = resolveCheckoutConfig("premium", {});
    expect(config.configured).toBe(false);
    expect(config.configured === false && config.reason).toContain(checkoutEnvVar("premium"));
  });

  it("aceita uma URL https", () => {
    const config = resolveCheckoutConfig("cents", {
      INFINITYPAY_CHECKOUT_URL_CENTS: "https://checkout.infinitepay.io/exemplo",
    });
    expect(config.configured).toBe(true);
    expect(config.configured === true && config.url).toContain("checkout.infinitepay.io");
  });

  it("recusa http, que exporia o cliente no caminho do pagamento", () => {
    const config = resolveCheckoutConfig("premium", {
      INFINITYPAY_CHECKOUT_URL_PREMIUM: "http://checkout.infinitepay.io/exemplo",
    });
    expect(config.configured).toBe(false);
  });

  it("recusa valor que não é URL", () => {
    const config = resolveCheckoutConfig("premium", {
      INFINITYPAY_CHECKOUT_URL_PREMIUM: "cole-o-link-aqui",
    });
    expect(config.configured).toBe(false);
  });

  it("usa uma variável distinta por plano", () => {
    // Uma só variável faria os dois planos irem para o mesmo checkout.
    expect(checkoutEnvVar("premium")).not.toBe(checkoutEnvVar("cents"));

    const onlyPremium = { INFINITYPAY_CHECKOUT_URL_PREMIUM: "https://checkout.exemplo/premium" };
    expect(resolveCheckoutConfig("premium", onlyPremium).configured).toBe(true);
    expect(resolveCheckoutConfig("cents", onlyPremium).configured).toBe(false);
  });
});

describe("política de confiança no retorno", () => {
  it("não confia por padrão", () => {
    // O padrão precisa ser o seguro: a URL de retorno é pública e não prova
    // pagamento nenhum.
    expect(shouldTrustCheckoutReturn({})).toBe(false);
    expect(shouldTrustCheckoutReturn({ INFINITYPAY_TRUST_RETURN: "" })).toBe(false);
    expect(shouldTrustCheckoutReturn({ INFINITYPAY_TRUST_RETURN: "1" })).toBe(false);
    expect(shouldTrustCheckoutReturn({ INFINITYPAY_TRUST_RETURN: "yes" })).toBe(false);
  });

  it("só confia com o valor explícito", () => {
    expect(shouldTrustCheckoutReturn({ INFINITYPAY_TRUST_RETURN: "true" })).toBe(true);
    expect(shouldTrustCheckoutReturn({ INFINITYPAY_TRUST_RETURN: " TRUE " })).toBe(true);
  });
});

describe("validação do retorno", () => {
  it("recusa quem chega sem intenção", () => {
    // Este é o caso de quem simplesmente digitou a URL de retorno.
    const verdict = validateIntentForReturn(null, "premium");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("not_found");
  });

  it("aceita uma intenção válida do mesmo plano", () => {
    const verdict = validateIntentForReturn(
      { planCode: "premium", status: "started", expiresAt: future },
      "premium",
    );
    expect(verdict.ok).toBe(true);
  });

  it("recusa retorno pela URL do outro plano", () => {
    // Pagar o checkout de um plano e voltar pela URL do PREMIUM não pode virar
    // PREMIUM. É a razão de existirem dois links.
    const verdict = validateIntentForReturn(
      { planCode: "cents", status: "started", expiresAt: future },
      "premium",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("plan_mismatch");
  });

  it("recusa intenção vencida", () => {
    const verdict = validateIntentForReturn(
      { planCode: "premium", status: "started", expiresAt: past },
      "premium",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("expired");
  });

  it("recusa reuso de uma intenção já confirmada", () => {
    // Sem isso, guardar a URL e reabrir depois reconfirmaria o pagamento.
    const verdict = validateIntentForReturn(
      { planCode: "premium", status: "confirmed", expiresAt: future },
      "premium",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("already_used");
  });

  it("aceita reabrir uma intenção que voltou mas ainda não foi confirmada", () => {
    // Recarregar a página de retorno enquanto o pagamento está em conferência
    // precisa mostrar o mesmo estado, não um erro.
    const verdict = validateIntentForReturn(
      { planCode: "cents", status: "returned", expiresAt: future },
      "cents",
    );
    expect(verdict.ok).toBe(true);
  });

  it("trata o vencimento pela data, mesmo com status ainda aberto", () => {
    // A rotina de expiração pode não ter rodado; o prazo vale de qualquer
    // forma.
    const verdict = validateIntentForReturn(
      { planCode: "premium", status: "started", expiresAt: past },
      "premium",
      new Date(),
    );
    expect(verdict.ok === false && verdict.code).toBe("expired");
  });

  it("dá prazo de um dia", () => {
    expect(CHECKOUT_INTENT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("URL do aviso de pagamento", () => {
  it("monta sem barra duplicada", () => {
    expect(infinityPayWebhookUrl("https://app.flycontrol.com.br")).toBe(
      "https://app.flycontrol.com.br/api/webhooks/infinitypay",
    );
    expect(infinityPayWebhookUrl("https://app.flycontrol.com.br/")).toBe(
      "https://app.flycontrol.com.br/api/webhooks/infinitypay",
    );
  });
});

describe("reconferência da InfinityPay", () => {
  it("recusa quando a InfinityPay não confirma pagamento", () => {
    const verdict = validateGatewayConfirmation({ paid: false, paidAmountCents: null }, 1000);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("not_paid");
  });

  it("recusa quando o valor pago é menor que o esperado", () => {
    // Cobrança parcial ou de outro valor não pode liberar o plano contratado.
    const verdict = validateGatewayConfirmation({ paid: true, paidAmountCents: 500 }, 1000);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("amount_mismatch");
  });

  it("aceita valor pago igual ao esperado", () => {
    expect(validateGatewayConfirmation({ paid: true, paidAmountCents: 1000 }, 1000).ok).toBe(true);
  });

  it("aceita valor pago maior — cartão pode repassar taxa ao cliente", () => {
    expect(validateGatewayConfirmation({ paid: true, paidAmountCents: 1010 }, 1000).ok).toBe(true);
  });
});

describe("token de intenção", () => {
  it("tem 32 bytes em hexadecimal", () => {
    expect(generateIntentToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("não repete", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateIntentToken()));
    expect(tokens.size).toBe(200);
  });

  it("é guardado como hash, nunca em claro", async () => {
    // O banco não deve conter token utilizável: um vazamento da tabela não
    // pode virar confirmação de pagamento alheia.
    const token = generateIntentToken();
    const hash = await hashIntentToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(await hashIntentToken(token)).toBe(hash);
  });
});

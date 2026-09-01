import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROVISION_DONE,
  PROVISION_FAILED,
  PROVISION_PENDING,
  decideProvisioning,
  isReadyForProvisioning,
} from "./provisioning";

const provisionado = {
  sf_restaurant_id: "rest_123",
  public_url: "https://conectfly.com.br/pizzaria-teste",
  sync_endpoint: "https://conectfly.com.br/api/public/menu-sync/pizzaria-teste/tok_123",
  provision_status: PROVISION_DONE,
};

describe("CENÁRIO 2 — execução duplicada não cria um segundo cardápio", () => {
  it("já provisionado: nem chega a chamar o SiteCreatorFly", () => {
    // Primeira camada de idempotência. A segunda é o índice único do outro
    // lado, que garante um tenant por estabelecimento mesmo em corrida.
    const decisao = decideProvisioning(provisionado);
    expect(decisao.action).toBe("skip");
  });

  it("clique duplo, refresh e webhook repetido dão todos no mesmo lugar", () => {
    for (let i = 0; i < 5; i++) {
      expect(decideProvisioning(provisionado).action).toBe("skip");
    }
  });
});

describe("CENÁRIO 2b — loja conectada pela metade", () => {
  it("com vínculo e URL, mas sem endereço de sincronização, provisiona de novo", () => {
    // Este era o estado que travava lojas novas: o cardápio abria normalmente,
    // então tudo PARECIA certo, mas nada que o dono mudasse no painel chegava
    // até lá — e a decisão antiga dizia "já provisionado", então nunca se
    // consertava sozinho. É o telefone da cozinha anotado errado: o salão
    // funciona, o pedido é que nunca chega no fogão.
    const decisao = decideProvisioning({ ...provisionado, sync_endpoint: null });
    expect(decisao).toEqual({ action: "provision", reason: "missing_sync_endpoint" });
  });

  it("endereço em branco conta como ausente", () => {
    expect(decideProvisioning({ ...provisionado, sync_endpoint: "   " }).action).toBe("provision");
  });

  it("quem não informa o campo continua sendo tratado como pela metade", () => {
    // Segurança para chamadas antigas que ainda não selecionam a coluna:
    // pedir provisionamento à toa é barato; deixar a loja muda, não.
    const { sync_endpoint: _ignorado, ...semCampo } = provisionado;
    expect(decideProvisioning(semCampo).action).toBe("provision");
  });
});

describe("CENÁRIO 1 — cadastro novo", () => {
  it("sem vínculo: provisiona", () => {
    const decisao = decideProvisioning({
      sf_restaurant_id: null,
      public_url: null,
      provision_status: null,
    });
    expect(decisao).toEqual({ action: "provision", reason: "missing_link" });
  });

  it("string vazia conta como ausente", () => {
    // Campo gravado em branco engana uma checagem ingênua de "existe".
    expect(
      decideProvisioning({ sf_restaurant_id: "  ", public_url: "", provision_status: null }).action,
    ).toBe("provision");
  });
});

describe("CENÁRIO 3 — falha e nova tentativa", () => {
  it("depois de falhar, tenta de novo", () => {
    const decisao = decideProvisioning({
      sf_restaurant_id: null,
      public_url: null,
      provision_status: PROVISION_FAILED,
    });
    expect(decisao).toEqual({ action: "provision", reason: "retry_after_failure" });
  });

  it("gravação pela metade é retomada", () => {
    // Tenant criado do outro lado mas URL não gravada aqui. Chamar de novo é
    // barato e o SiteCreatorFly devolve o mesmo tenant.
    const decisao = decideProvisioning({
      sf_restaurant_id: "rest_123",
      public_url: null,
      provision_status: PROVISION_DONE,
    });
    expect(decisao).toEqual({ action: "provision", reason: "missing_url" });
  });

  it("interrompido no meio (pendente) é retomado", () => {
    expect(
      decideProvisioning({
        sf_restaurant_id: null,
        public_url: null,
        provision_status: PROVISION_PENDING,
      }).action,
    ).toBe("provision");
  });
});

describe("gatilho: só depois do pagamento", () => {
  it("dispara com assinatura ativa", () => {
    expect(isReadyForProvisioning("active")).toBe(true);
  });

  it("não dispara antes de o pagamento ser aceito", () => {
    // Provisionar aqui seria entregar o cardápio de graça.
    for (const status of ["pending_activation", "pending_payment", "suspended", "canceled", null]) {
      expect(isReadyForProvisioning(status)).toBe(false);
    }
  });
});

describe("estados usam a coluna que já existe", () => {
  it("os três valores batem com o CHECK do banco", () => {
    // Inventar um quarto estado sem migration faria a gravação ser recusada
    // exatamente no meio do provisionamento.
    const sql = readFileSync(
      "DATABASE/supabase/migrations/20260713033021_68fd0f27-60ee-4b37-8177-60e485ceb73c.sql",
      "utf8",
    );
    for (const estado of [PROVISION_PENDING, PROVISION_DONE, PROVISION_FAILED]) {
      expect(sql).toContain(`'${estado}'`);
    }
  });
});

describe("ligação nos pontos de conclusão do onboarding", () => {
  const caminhos = [
    ["retorno do checkout", "src/lib/billing/checkout.functions.ts"],
    ["ativação pelo painel", "src/lib/billing/subscriptionAdmin.functions.ts"],
    ["atalho de teste", "src/lib/signup/signup.functions.ts"],
    ["repescagem", "src/routes/api/provisioning.retry.ts"],
  ] as const;

  it.each(caminhos)("%s dispara o provisionamento", (_nome, arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte).toMatch(/provisionAndForget|ensureRestaurantProvisioned/);
  });

  it.each(caminhos)("%s espera o provisionamento terminar", (_nome, arquivo) => {
    // Promessa solta em Cloudflare Worker é descartada assim que a resposta
    // sai: o provisionamento morria antes da primeira gravação e o
    // estabelecimento ficava com tudo nulo, sem nem uma falha registrada.
    // Aconteceu em produção — daí o teste.
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte, `${arquivo}: chamada solta com void`).not.toMatch(
      /\bvoid\s+(provisionAndForget|ensureRestaurantProvisioned)\(/,
    );
    expect(fonte, `${arquivo}: falta await`).toMatch(
      /await (provisionAndForget|ensureRestaurantProvisioned)\(/,
    );
  });

  it("o vínculo é o id do estabelecimento, e não nome ou slug", () => {
    // Nome, telefone e slug mudam; o id não. Vincular pelo que muda quebraria
    // a ligação no dia em que o cliente renomear a loja.
    const fonte = readFileSync("src/lib/provisioning/ensureProvisioned.server.ts", "utf8");
    expect(fonte).toContain("flycontrol_id: company.id");
  });

  it("nunca derruba o cadastro quando o SiteCreatorFly falha", () => {
    const fonte = readFileSync("src/lib/provisioning/ensureProvisioned.server.ts", "utf8");
    // Falha vira estado gravado e resultado, nunca exceção para quem chamou.
    expect(fonte).not.toMatch(/^\s*throw /m);
    expect(fonte).toContain("PROVISION_FAILED");
  });
});

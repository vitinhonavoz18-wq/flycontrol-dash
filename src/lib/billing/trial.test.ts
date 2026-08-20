import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_CODE,
  buildTrialTimeline,
  calculateTrialProgress,
  computeCycleStartAfter,
  computeTrialEnd,
  deriveSubscriptionPhase,
  formatTrialDate,
} from "./trial";
import { PLAN_PRICING } from "./plans";
import { isOperational } from "./subscriptionStatus";

const MIGRATION = "supabase/migrations/20260820120000_free_trial.sql";
const sql = () => readFileSync(MIGRATION, "utf8");

const DIA = 86_400_000;

describe("30 dias sao 30 dias", () => {
  it("o fim do periodo cai exatamente 30 dias depois do inicio", () => {
    const inicio = new Date("2026-08-20T12:00:00.000Z");
    const fim = computeTrialEnd(inicio);
    expect(fim.getTime() - inicio.getTime()).toBe(30 * DIA);
  });

  it("fevereiro nao encurta o brinde", () => {
    // Ancorar no mes daria 28 dias em fevereiro. A promessa e de 30.
    const inicio = new Date("2026-02-01T00:00:00.000Z");
    expect(computeTrialEnd(inicio).getTime() - inicio.getTime()).toBe(30 * DIA);
  });

  it("o banco usa a mesma duracao que o codigo", () => {
    // Se o padrao do banco fosse 15 e o do codigo 30, a tela prometeria um
    // numero e o sistema entregaria outro.
    expect(TRIAL_DURATION_DAYS).toBe(30);
    expect(sql()).toContain("p_duration_days INTEGER DEFAULT 30");
  });
});

describe("contador de dias restantes", () => {
  const inicio = new Date("2026-08-01T00:00:00.000Z");
  const fim = computeTrialEnd(inicio);

  it("no primeiro dia mostra 30 restantes", () => {
    const p = calculateTrialProgress({ trialStart: inicio, trialEnd: fim, now: inicio });
    expect(p.daysRemaining).toBe(30);
    expect(p.percent).toBe(0);
    expect(p.ended).toBe(false);
  });

  it("no setimo dia mostra 23 restantes", () => {
    const agora = new Date(inicio.getTime() + 7 * DIA);
    const p = calculateTrialProgress({ trialStart: inicio, trialEnd: fim, now: agora });
    expect(p.daysRemaining).toBe(23);
    expect(p.message).toBe("23 dias restantes");
  });

  it("no ultimo dia ainda mostra 1, e nao 0", () => {
    // Ler "0 dias restantes" enquanto o sistema ainda funciona parece erro.
    const agora = new Date(fim.getTime() - 60_000);
    expect(
      calculateTrialProgress({ trialStart: inicio, trialEnd: fim, now: agora }).daysRemaining,
    ).toBe(1);
  });

  it("passado o prazo, zera e marca como encerrado", () => {
    const agora = new Date(fim.getTime() + 5 * DIA);
    const p = calculateTrialProgress({ trialStart: inicio, trialEnd: fim, now: agora });
    expect(p.daysRemaining).toBe(0);
    expect(p.ended).toBe(true);
    expect(p.percent).toBe(100);
  });

  it("a barra nunca passa de 100 nem fica negativa", () => {
    for (const dias of [-10, 0, 15, 30, 90]) {
      const p = calculateTrialProgress({
        trialStart: inicio,
        trialEnd: fim,
        now: new Date(inicio.getTime() + dias * DIA),
      });
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("linha do tempo mostrada no fim do cadastro", () => {
  const ativacao = new Date("2026-08-20T15:30:00.000Z");
  const linha = buildTrialTimeline(ativacao);

  it("o ciclo cobrado comeca quando o gratuito termina", () => {
    // Um dia de folga entre os dois deixaria pedidos sem ciclo nenhum.
    expect(linha.usageCycleStart.getTime()).toBe(linha.trialEnd.getTime());
  });

  it("a primeira cobranca so acontece no fim do ciclo cobrado", () => {
    expect(linha.firstChargeAt.getTime()).toBe(linha.usageCycleEnd.getTime());
    // E nunca antes do fim do periodo gratuito.
    expect(linha.firstChargeAt.getTime()).toBeGreaterThan(linha.trialEnd.getTime());
  });

  it("a primeira cobranca fica a pelo menos 55 dias do cadastro", () => {
    // 30 gratuitos + um mes cobrado. E o que sustenta "pague so depois de usar".
    const dias = (linha.firstChargeAt.getTime() - ativacao.getTime()) / DIA;
    expect(dias).toBeGreaterThan(55);
  });
});

describe("emenda entre ciclos", () => {
  it("depois do gratuito, o proximo comeca no instante seguinte ao fim", () => {
    const inicio = new Date("2026-08-20T00:00:00.000Z");
    const fim = new Date(computeTrialEnd(inicio).getTime() - 1);
    const proximo = computeCycleStartAfter({
      cycleType: "free_trial",
      cycleStart: inicio,
      cycleEnd: fim,
    });
    expect(proximo.getTime()).toBe(fim.getTime() + 1);
  });

  it("ciclo cobrado mantem a ancora mensal de sempre", () => {
    // Trocar a regra do ciclo cobrado mudaria a cobranca de quem ja e cliente.
    const inicio = new Date(Date.UTC(2026, 0, 15));
    const proximo = computeCycleStartAfter({
      cycleType: "usage",
      cycleStart: inicio,
      cycleEnd: new Date(Date.UTC(2026, 1, 14)),
    });
    expect(proximo.toISOString()).toBe(new Date(Date.UTC(2026, 1, 15)).toISOString());
  });
});

describe("situacao comercial mostrada na tela", () => {
  it("assinatura em periodo gratuito", () => {
    expect(deriveSubscriptionPhase({ status: "free_trial", cycleType: "free_trial" })).toBe(
      "free_trial",
    );
  });

  it("recem-saida do gratuito, sem fatura nenhuma ainda", () => {
    expect(
      deriveSubscriptionPhase({ status: "active", cycleType: "usage", closedUsageCycles: 0 }),
    ).toBe("usage_cycle");
  });

  it("cliente em regime, com faturas no historico", () => {
    expect(
      deriveSubscriptionPhase({ status: "active", cycleType: "usage", closedUsageCycles: 3 }),
    ).toBe("active");
  });

  it("atraso e suspensao tem nome proprio", () => {
    expect(deriveSubscriptionPhase({ status: "past_due" })).toBe("overdue");
    expect(deriveSubscriptionPhase({ status: "suspended" })).toBe("suspended");
    expect(deriveSubscriptionPhase({ status: "pending_payment" })).toBe("payment_pending");
  });
});

describe("periodo gratuito nao pode ser reiniciado pelo navegador", () => {
  it("quem concede e o banco, e a trava e um indice unico", () => {
    const fonte = sql();
    expect(fonte).toContain("CREATE TABLE IF NOT EXISTS public.trial_grants");
    expect(fonte).toContain("trial_grants_company_uq");
    expect(fonte).toContain("trial_grants_email_uq");
    expect(fonte).toContain("trial_grants_document_uq");
  });

  it("a funcao de concessao trata a colisao como recusa, e nao como erro", () => {
    const fonte = sql();
    expect(fonte).toContain("EXCEPTION WHEN unique_violation THEN");
    expect(fonte).toContain("trial_already_used");
  });

  it("so assinatura no comeco da vida pode receber o brinde", () => {
    // Sem isso, um cliente ativo ha um ano pediria 30 dias gratis.
    expect(sql()).toContain("v_sub.status NOT IN ('pending_activation', 'pending_payment')");
  });

  it("repetir a chamada devolve o mesmo periodo, e nao 30 dias novos", () => {
    expect(sql()).toContain("'already_granted', true");
  });

  it("o navegador nao tem permissao de executar a concessao", () => {
    const fonte = sql();
    expect(fonte).toContain(
      "REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM authenticated",
    );
    expect(fonte).toContain(
      "GRANT EXECUTE ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) TO service_role",
    );
  });

  it("o aplicativo so pede: quem decide e a funcao do banco", () => {
    const fonte = readFileSync("src/lib/billing/trial.server.ts", "utf8");
    expect(fonte).toContain('rpc("start_free_trial"');
    // As datas vem prontas do banco. Calcular aqui abriria espaco para o
    // relogio do servidor e o do banco discordarem sobre quando o brinde acaba.
    expect(fonte).not.toMatch(/computeTrialEnd|new Date\(Date\.now\(\)/);
    // E uma recusa nunca pode virar excecao: o cadastro segue sem o brinde.
    expect(fonte).toContain("granted: false");
  });
});

describe("nada e cobrado no periodo gratuito", () => {
  it("o preco congelado do ciclo gratuito e zero", () => {
    const fonte = sql();
    expect(fonte).toContain("WHEN p_cycle_type = 'free_trial' THEN 0");
  });

  it("o cadastro no periodo gratuito nao manda ninguem para o checkout", () => {
    const fonte = readFileSync("src/lib/signup/signup.functions.ts", "utf8");
    // O bloco do trial devolve checkout nulo de proposito.
    expect(fonte).toMatch(/subscriptionStatus: "free_trial"[\s\S]{0,200}checkout: null/);
  });

  it("o fechamento do ciclo gratuito nao emite fatura", () => {
    const fonte = readFileSync("src/lib/billing/closeCycle.server.ts", "utf8");
    expect(fonte).toContain("closeFreeTrialCycle");
    expect(fonte).toContain("invoiceId: null");
  });

  it("o fim do periodo gratuito nao bloqueia o sistema", () => {
    // O cliente continua operando; muda so o que passa a ser contado.
    expect(isOperational("free_trial")).toBe(true);
    expect(isOperational("active")).toBe(true);
    const fonte = readFileSync("src/lib/billing/closeCycle.server.ts", "utf8");
    expect(fonte).toContain('status: "active"');
    expect(fonte).not.toContain('status: "suspended"');
  });
});

describe("estados novos existem tambem no banco", () => {
  it("free_trial esta no CHECK da assinatura", () => {
    // Inventar um estado so no TypeScript faria a gravacao ser recusada
    // exatamente no meio do cadastro.
    expect(sql()).toContain("'pending_activation', 'pending_payment', 'free_trial', 'active'");
  });

  it("o tipo de ciclo esta no CHECK do ciclo", () => {
    expect(sql()).toContain("CHECK (cycle_type IN ('free_trial', 'usage'))");
  });

  it("a versao antiga do abridor de ciclo e removida", () => {
    // Duas funcoes de mesmo nome fariam a chamada de 4 argumentos cair na
    // antiga, que nao conhece ciclo gratuito.
    expect(sql()).toContain(
      "DROP FUNCTION IF EXISTS public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN)",
    );
  });

  it("pedido feito no periodo gratuito e contado, mas a zero", () => {
    const fonte = sql();
    expect(fonte).toContain("s.status IN ('active', 'past_due', 'free_trial')");
  });
});

describe("logica comercial do CENTS preservada", () => {
  it("os precos por pedido nao foram alterados por esta mudanca", () => {
    // O periodo gratuito adia a cobranca; nao muda quanto custa.
    expect(PLAN_PRICING.cents.defaultOrderUnitPriceCents).toBe(70);
    expect(PLAN_PRICING.cents.promotionalOrderUnitPriceCents).toBe(45);
    expect(PLAN_PRICING.cents.promotionThresholdOrders).toBe(500);
  });

  it("cadastro novo entra no plano por uso", () => {
    expect(TRIAL_PLAN_CODE).toBe("cents");
  });
});

describe("datas na tela", () => {
  it("data ausente vira travessao, e nao 'Invalid Date'", () => {
    expect(formatTrialDate(null)).toBe("—");
    expect(formatTrialDate("nao e data")).toBe("—");
  });

  it("data valida sai no formato brasileiro", () => {
    expect(formatTrialDate("2026-08-20T12:00:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O corte por falta de pagamento, de ponta a ponta.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * `decideCollectionsAction` (collections.test.ts) já provava a REGRA: dado o
 * vencimento e a hora, suspende ou não. Mas quem executa a decisão é
 * `reconcileOverdueInvoices`, e essa parte nunca teve teste nenhum — nem
 * nunca rodou de verdade em produção.
 *
 * É a diferença entre conferir que o gerente sabe a regra e conferir que ele
 * realmente virou a chave: trancou a porta, avisou a vitrine e anotou no
 * livro. Uma engrenagem que nunca girou é exatamente onde o defeito mora.
 *
 * Cada teste aqui corresponde a um passo do roteiro manual de produção — a
 * ideia é que o roteiro só precise confirmar o que aqui já está provado.
 */

const HORA = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dublê do Supabase
//
// Grava toda escrita numa lista, para o teste perguntar depois "o que você
// mandou para o banco?" em vez de precisar de um banco de verdade.
// ---------------------------------------------------------------------------

type Escrita = { tabela: string; op: "update" | "insert"; valores: Record<string, unknown> };

let escritas: Escrita[] = [];
let faturas: Record<string, unknown>[] = [];
let assinatura: Record<string, unknown> | null = null;
let loja: Record<string, unknown> | null = null;
let atualizacaoDeAssinaturaPega = true;

function construtor(tabela: string) {
  const alvo = {
    select: () => alvo,
    eq: () => alvo,
    neq: () => alvo,
    lte: () => alvo,
    update(valores: Record<string, unknown>) {
      escritas.push({ tabela, op: "update", valores });
      return alvo;
    },
    insert(valores: Record<string, unknown>) {
      escritas.push({ tabela, op: "insert", valores });
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: () =>
      Promise.resolve({
        data: tabela === "subscriptions" ? assinatura : tabela === "pizzerias" ? loja : null,
        error: null,
      }),
    // O `await` direto na cadeia (sem .maybeSingle()) cai aqui.
    then(resolve: (v: { data: unknown; error: null }) => unknown) {
      if (tabela === "invoices") return resolve({ data: faturas, error: null });
      if (tabela === "subscriptions") {
        // `.select("id")` depois do update devolve [] quando a condição de
        // status não bateu — é assim que a corrida entre dois processos é
        // detectada no código de verdade.
        return resolve({ data: atualizacaoDeAssinaturaPega ? [{ id: "sub-1" }] : [], error: null });
      }
      return resolve({ data: [], error: null });
    },
  };
  return alvo;
}

const supabaseFalso = { from: (t: string) => construtor(t) };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => construtor(t) },
}));

const sincronizou = vi.fn();
vi.mock("@/utils/menuSync", () => ({
  syncToExternal: (params: unknown) => sincronizou(params),
}));

// Importado depois dos mocks, senão pega o módulo de verdade.
const { reconcileOverdueInvoices } = await import("./collections.server");
void supabaseFalso;

// ---------------------------------------------------------------------------

function cenario(horasDeAtraso: number, statusDaAssinatura = "active") {
  const vencimento = new Date(Date.now() - horasDeAtraso * HORA);
  escritas = [];
  sincronizou.mockReset();
  sincronizou.mockResolvedValue({ success: true });
  atualizacaoDeAssinaturaPega = true;
  faturas = [
    {
      id: "fat-1",
      subscription_id: "sub-1",
      company_id: "loja-1",
      due_at: vencimento.toISOString(),
    },
  ];
  assinatura = { id: "sub-1", status: statusDaAssinatura };
  loja = {
    slug: "pizzaria-teste",
    api_key: "chave",
    sync_endpoint: "https://exemplo/sync",
    sf_restaurant_id: "sf-1",
    name: "Pizzaria Teste",
  };
}

const escritasEm = (tabela: string) => escritas.filter((e) => e.tabela === tabela);

beforeEach(() => {
  escritas = [];
  sincronizou.mockReset();
});

describe("dentro das 24 horas de tolerância: avisa, não corta", () => {
  it("marca a assinatura em atraso", async () => {
    cenario(2);
    const r = await reconcileOverdueInvoices();

    expect(r.markedPastDue).toBe(1);
    expect(r.suspended).toBe(0);
    expect(escritasEm("subscriptions")[0].valores.status).toBe("past_due");
  });

  it("a loja continua atendendo", async () => {
    cenario(2);
    await reconcileOverdueInvoices();

    // `past_due` ainda é acesso liberado: quem pagou hoje e a compensação
    // ainda não caiu não pode ficar sem operar.
    expect(escritasEm("pizzerias")[0].valores.subscription_status).toBe("active");
  });

  it("a vitrine NÃO é fechada", async () => {
    cenario(2);
    await reconcileOverdueInvoices();
    expect(sincronizou).not.toHaveBeenCalled();
  });
});

describe("passadas as 24 horas: corta de verdade", () => {
  it("suspende a assinatura", async () => {
    cenario(25, "past_due");
    const r = await reconcileOverdueInvoices();

    expect(r.suspended).toBe(1);
    expect(escritasEm("subscriptions")[0].valores.status).toBe("suspended");
    expect(escritasEm("subscriptions")[0].valores.suspended_at).toBeTruthy();
  });

  it("tranca a porta que o painel e os pedidos conferem", async () => {
    cenario(25, "past_due");
    await reconcileOverdueInvoices();

    // É este campo que o _app.tsx lê para travar o painel e que o
    // /api/orders lê para devolver 403 store_suspended.
    expect(escritasEm("pizzerias")[0].valores.subscription_status).toBe("suspended");
  });

  it("fecha a vitrine no SiteCreatorFly", async () => {
    cenario(25, "past_due");
    await reconcileOverdueInvoices();

    expect(sincronizou).toHaveBeenCalledTimes(1);
    const enviado = sincronizou.mock.calls[0][0] as {
      type: string;
      externalId: string;
      data: { is_open: boolean };
    };
    expect(enviado.type).toBe("restaurant");
    expect(enviado.externalId).toBe("sf-1");
    expect(enviado.data.is_open).toBe(false);
  });

  it("marca a fatura como vencida e registra na auditoria", async () => {
    cenario(25, "past_due");
    await reconcileOverdueInvoices();

    expect(escritasEm("invoices")[0].valores.status).toBe("overdue");
    const evento = escritasEm("subscription_events")[0].valores;
    expect(evento.event_type).toBe("suspended_for_nonpayment");
    expect(evento.new_status).toBe("suspended");
  });

  it("suspende mesmo se o cron pulou dias e nunca marcou past_due", async () => {
    cenario(100, "active");
    expect((await reconcileOverdueInvoices()).suspended).toBe(1);
  });
});

describe("a vitrine é aviso, não bloqueio", () => {
  it("falha ao fechar a vitrine não impede a suspensão", async () => {
    // O SiteCreatorFly pode estar fora do ar na hora do corte. Se isso
    // abortasse a suspensão, bastaria o outro sistema cair para ninguém mais
    // ser cobrado — e o pedido já está barrado no /api/orders de qualquer jeito.
    cenario(25, "past_due");
    sincronizou.mockResolvedValue({ success: false, error: "timeout" });

    const r = await reconcileOverdueInvoices();

    expect(r.suspended).toBe(1);
    expect(escritasEm("pizzerias")[0].valores.subscription_status).toBe("suspended");
    expect(r.errors.join(" ")).toContain("vitrine não fechou");
  });

  it("loja que nunca foi provisionada não vira erro", async () => {
    // Quem só usa o painel não tem vitrine para fechar. Não é falha.
    cenario(25, "past_due");
    loja = { ...loja!, sync_endpoint: null, sf_restaurant_id: null };

    const r = await reconcileOverdueInvoices();

    expect(r.suspended).toBe(1);
    expect(sincronizou).not.toHaveBeenCalled();
    expect(r.errors).toEqual([]);
  });
});

describe("não repete o que já foi feito", () => {
  it("assinatura já suspensa não é suspensa de novo", async () => {
    cenario(25, "suspended");
    const r = await reconcileOverdueInvoices();

    expect(r.suspended).toBe(0);
    expect(escritas).toEqual([]);
    expect(sincronizou).not.toHaveBeenCalled();
  });

  it("não sobrescreve mudança feita por outro processo no meio do caminho", async () => {
    // A gravação é condicionada ao status lido. Se outro processo mexeu na
    // assinatura enquanto este laço rodava, a condição não bate e o registro
    // é pulado — sem fechar vitrine nem gravar auditoria de algo que não houve.
    cenario(25, "past_due");
    atualizacaoDeAssinaturaPega = false;

    const r = await reconcileOverdueInvoices();

    expect(r.suspended).toBe(0);
    expect(escritasEm("pizzerias")).toEqual([]);
    expect(sincronizou).not.toHaveBeenCalled();
  });
});

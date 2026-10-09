import { beforeEach, describe, expect, it } from "vitest";
import {
  criarClienteSyncPay,
  esquecerTokensGuardados,
  FalhaSyncPay,
  semDadosPessoais,
} from "./syncpay";

/**
 * SyncPay de mentira: responde o que cada teste mandar e anota cada chamada.
 * Nenhum teste aqui fala com a SyncPay de verdade nem movimenta dinheiro.
 */
type Roteiro = (url: string, init: RequestInit) => { status: number; body?: unknown } | "queda";

function syncpayFalsa(roteiro: Roteiro) {
  const chamadas: Array<{ url: string; metodo: string; corpo: unknown; auth: string | null }> = [];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    chamadas.push({
      url: String(url),
      metodo: String(init.method),
      corpo: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization"),
    });
    const r = roteiro(String(url), init);
    if (r === "queda") throw new TypeError("network error");
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fetchFalso, chamadas };
}

const TOKEN_OK = {
  status: 200,
  body: { access_token: "tok-1", token_type: "Bearer", expires_in: 3600 },
};
const ehAuth = (u: string) => u.endsWith("/api/partner/v1/auth-token");
const ehCashIn = (u: string) => u.endsWith("/api/partner/v1/cash-in");

const PEDIDO = {
  valorCentavos: 10_000,
  descricao: "Pedido FlyDelivery - Pizzaria A",
  webhookUrl: "https://painel.exemplo/api/webhooks/syncpay",
  cliente: { nome: "Ana", cpf: "52998224725", email: "ana@x.com", telefone: "11999990000" },
  split: [{ userId: "conta-da-loja-a", percentual: 97 }],
};

function cliente(roteiro: Roteiro, agora = () => 1_000_000) {
  const falsa = syncpayFalsa(roteiro);
  const c = criarClienteSyncPay({
    baseUrl: "https://api.syncpayments.com.br",
    clientId: "conta-da-plataforma",
    clientSecret: "SEGREDO-SUPER-SECRETO",
    fetch: falsa.fetchFalso,
    agora,
    esperar: async () => {},
  });
  return { c, chamadas: falsa.chamadas };
}

beforeEach(() => esquecerTokensGuardados());

describe("autenticação na SyncPay", () => {
  it("credenciais válidas: pede o token uma vez e reaproveita enquanto vale", async () => {
    const { c, chamadas } = cliente((u) =>
      ehAuth(u) ? TOKEN_OK : { status: 200, body: { identifier: "ID1", pix_code: "PIX" } },
    );
    await c.criarCobrancaPix(PEDIDO);
    await c.criarCobrancaPix(PEDIDO);
    expect(chamadas.filter((x) => ehAuth(x.url))).toHaveLength(1);
    expect(chamadas[0].corpo).toEqual({
      client_id: "conta-da-plataforma",
      client_secret: "SEGREDO-SUPER-SECRETO",
    });
    expect(chamadas[1].auth).toBe("Bearer tok-1");
  });

  it("várias cobranças ao mesmo tempo disparam UM pedido de token (evita o 429 da SyncPay)", async () => {
    const { c, chamadas } = cliente((u) =>
      ehAuth(u) ? TOKEN_OK : { status: 200, body: { identifier: "ID", pix_code: "PIX" } },
    );
    await Promise.all([
      c.criarCobrancaPix(PEDIDO),
      c.criarCobrancaPix(PEDIDO),
      c.criarCobrancaPix(PEDIDO),
    ]);
    expect(chamadas.filter((x) => ehAuth(x.url))).toHaveLength(1);
  });

  it("renova o token antes de vencer", async () => {
    let agora = 1_000_000;
    const { c, chamadas } = cliente(
      (u) => (ehAuth(u) ? TOKEN_OK : { status: 200, body: { identifier: "ID", pix_code: "PIX" } }),
      () => agora,
    );
    await c.obterToken();
    agora += 3_600_000 - 30_000; // falta meio minuto: dentro da margem de renovação
    await c.obterToken();
    expect(chamadas.filter((x) => ehAuth(x.url))).toHaveLength(2);
  });

  it("credenciais inválidas: erro claro, sem o segredo na mensagem", async () => {
    const { c } = cliente(() => ({ status: 401, body: { message: "Unauthenticated" } }));
    const erro = await c.obterToken().catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaSyncPay);
    expect(erro.tipo).toBe("credenciais");
    expect(String(erro.message)).not.toContain("SEGREDO-SUPER-SECRETO");
  });

  it("422 e 429 no token viram erros próprios", async () => {
    const a = cliente(() => ({ status: 422, body: { message: "client_id inválido" } }));
    expect((await a.c.obterToken().catch((e) => e)).tipo).toBe("credenciais");
    esquecerTokensGuardados();
    const b = cliente(() => ({ status: 429 }));
    expect((await b.c.obterToken().catch((e) => e)).tipo).toBe("limite");
  });

  it("queda de rede ao autenticar tenta de novo uma vez (pedir token não cobra nada)", async () => {
    let n = 0;
    const { c } = cliente((u) => (ehAuth(u) && n++ === 0 ? "queda" : TOKEN_OK));
    await expect(c.obterToken()).resolves.toBe("tok-1");
  });
});

describe("criação do Pix com split", () => {
  it("manda valor em reais, o cliente e o split com a conta DA LOJA em percentual inteiro", async () => {
    const { c, chamadas } = cliente((u) =>
      ehAuth(u)
        ? TOKEN_OK
        : { status: 200, body: { message: "ok", identifier: "SYNC-1", pix_code: "000201PIX" } },
    );
    const r = await c.criarCobrancaPix(PEDIDO);
    expect(r).toEqual({ identificador: "SYNC-1", pixCopiaECola: "000201PIX" });
    const cashIn = chamadas.find((x) => ehCashIn(x.url))!;
    expect(cashIn.metodo).toBe("POST");
    expect(cashIn.corpo).toEqual({
      amount: 100,
      description: "Pedido FlyDelivery - Pizzaria A",
      webhook_url: "https://painel.exemplo/api/webhooks/syncpay",
      client: { name: "Ana", cpf: "52998224725", email: "ana@x.com", phone: "11999990000" },
      split: [{ user_id: "conta-da-loja-a", percentage: 97 }],
    });
  });

  it("recusa ANTES de chamar a SyncPay: recebedor = plataforma, percentual quebrado, soma 100%", async () => {
    const { c, chamadas } = cliente(() => TOKEN_OK);
    const erros = await Promise.all([
      c
        .criarCobrancaPix({ ...PEDIDO, split: [{ userId: "conta-da-plataforma", percentual: 97 }] })
        .catch((e) => e),
      c
        .criarCobrancaPix({ ...PEDIDO, split: [{ userId: "loja", percentual: 97.5 }] })
        .catch((e) => e),
      c
        .criarCobrancaPix({ ...PEDIDO, split: [{ userId: "loja", percentual: 100 }] })
        .catch((e) => e),
      c.criarCobrancaPix({ ...PEDIDO, split: [] }).catch((e) => e),
      c.criarCobrancaPix({ ...PEDIDO, valorCentavos: 0 }).catch((e) => e),
    ]);
    for (const e of erros) expect(e).toBeInstanceOf(Error);
    expect(erros.slice(0, 4).every((e) => e.tipo === "validacao")).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  it("token recusado (401) no cash-in: renova e tenta UMA vez — 401 quer dizer que nada foi criado", async () => {
    let cashIns = 0;
    const { c, chamadas } = cliente((u) => {
      if (ehAuth(u)) return TOKEN_OK;
      cashIns++;
      return cashIns === 1
        ? { status: 401 }
        : { status: 200, body: { identifier: "ID2", pix_code: "PIX2" } };
    });
    await expect(c.criarCobrancaPix(PEDIDO)).resolves.toEqual({
      identificador: "ID2",
      pixCopiaECola: "PIX2",
    });
    expect(chamadas.filter((x) => ehAuth(x.url))).toHaveLength(2);
  });

  it.each([
    [500, "incerto"],
    [502, "incerto"],
    [504, "incerto"],
  ])(
    "HTTP %s no cash-in vira '%s' e NÃO é repetido (risco de cobrança dupla)",
    async (status, tipo) => {
      const { c, chamadas } = cliente((u) => (ehAuth(u) ? TOKEN_OK : { status }));
      const erro = await c.criarCobrancaPix(PEDIDO).catch((e) => e);
      expect(erro.tipo).toBe(tipo);
      expect(chamadas.filter((x) => ehCashIn(x.url))).toHaveLength(1);
    },
  );

  it("queda de rede no cash-in vira 'incerto' e NÃO é repetida", async () => {
    const { c, chamadas } = cliente((u) => (ehAuth(u) ? TOKEN_OK : "queda"));
    expect((await c.criarCobrancaPix(PEDIDO).catch((e) => e)).tipo).toBe("incerto");
    expect(chamadas.filter((x) => ehCashIn(x.url))).toHaveLength(1);
  });

  it("422 traz a explicação da SyncPay; 429 pede para esperar; nenhum dos dois repete", async () => {
    const a = cliente((u) =>
      ehAuth(u)
        ? TOKEN_OK
        : { status: 422, body: { message: "Dados inválidos", errors: { cpf: ["CPF inválido"] } } },
    );
    const e422 = await a.c.criarCobrancaPix(PEDIDO).catch((e) => e);
    expect(e422.tipo).toBe("validacao");
    expect(e422.message).toContain("CPF inválido");
    esquecerTokensGuardados();
    const b = cliente((u) => (ehAuth(u) ? TOKEN_OK : { status: 429 }));
    expect((await b.c.criarCobrancaPix(PEDIDO).catch((e) => e)).tipo).toBe("limite");
    expect(b.chamadas.filter((x) => ehCashIn(x.url))).toHaveLength(1);
  });

  it("resposta 200 sem identificador é 'incerto', não sucesso", async () => {
    const { c } = cliente((u) => (ehAuth(u) ? TOKEN_OK : { status: 200, body: { message: "ok" } }));
    expect((await c.criarCobrancaPix(PEDIDO).catch((e) => e)).tipo).toBe("incerto");
  });
});

describe("consulta da transação (a reconferência)", () => {
  it("lê situação, valor e divisão da API v2", async () => {
    const { c, chamadas } = cliente((u) =>
      ehAuth(u)
        ? TOKEN_OK
        : {
            status: 200,
            body: {
              data: {
                reference_id: "SYNC-1",
                status: "completed",
                amount: "100.00",
                split: [{ user_id: "conta-da-loja-a", percentage: 97 }],
                client: { name: "Ana", cpf: "52998224725", email: "ana@x.com" },
              },
            },
          },
    );
    const t = await c.consultarTransacao("SYNC-1");
    expect(chamadas[1].url).toBe(
      "https://api.syncpayments.com.br/api/partner/v2/transactions/SYNC-1",
    );
    expect(t).toMatchObject({
      referencia: "SYNC-1",
      situacao: "completed",
      valorCentavos: 10_000,
      split: [{ userId: "conta-da-loja-a", percentual: 97 }],
    });
    // O que fica guardado não leva dados do cliente.
    expect(JSON.stringify(t.resumo)).not.toContain("52998224725");
    expect(JSON.stringify(t.resumo)).not.toContain("ana@x.com");
  });

  it("v2 sem a transação: tenta o endereço v1 da documentação de ajuda", async () => {
    const { c, chamadas } = cliente((u) => {
      if (ehAuth(u)) return TOKEN_OK;
      if (u.includes("/v2/")) return { status: 404 };
      return { status: 200, body: { data: { reference_id: "X", status: "pending", amount: 50 } } };
    });
    const t = await c.consultarTransacao("X");
    expect(chamadas.at(-1)!.url).toBe(
      "https://api.syncpayments.com.br/api/partner/v1/transaction/X",
    );
    expect(t).toMatchObject({ situacao: "pending", valorCentavos: 5_000, split: null });
  });

  it("não encontrada nos dois endereços vira erro próprio", async () => {
    const { c } = cliente((u) => (ehAuth(u) ? TOKEN_OK : { status: 404 }));
    expect((await c.consultarTransacao("NADA").catch((e) => e)).tipo).toBe("nao_encontrada");
  });

  it("consulta pode ser repetida em queda/429/5xx (consultar não cobra nada)", async () => {
    let n = 0;
    const { c } = cliente((u) => {
      if (ehAuth(u)) return TOKEN_OK;
      n++;
      if (n === 1) return "queda";
      if (n === 2) return { status: 503 };
      return { status: 200, body: { status: "pending", amount: 1 } };
    });
    await expect(c.consultarTransacao("Y")).resolves.toMatchObject({ situacao: "pending" });
  });
});

describe("dados pessoais fora dos registros", () => {
  it("tira cliente, CPF, e-mail, telefone e código Pix de qualquer nível", () => {
    const limpo = semDadosPessoais({
      status: "completed",
      client: { cpf: "1" },
      data: { payer: { name: "Ana" }, email: "a@b", phone: "11", pix_code: "000201", amount: 10 },
    });
    expect(limpo).toEqual({ status: "completed", data: { amount: 10 } });
  });
});

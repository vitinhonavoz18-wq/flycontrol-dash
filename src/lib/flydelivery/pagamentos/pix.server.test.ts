import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  conciliarPendentes,
  consultarSituacao,
  gerarPix,
  processarAviso,
  reconferir,
  type BancoDoPix,
  type Dependencias,
  type PagamentoGuardado,
} from "./pix.server";
import { FalhaSyncPay, type ClienteSyncPay } from "./syncpay";
import type { ConfigDoPix } from "./config.server";

const CHECKOUT = "11111111-2222-3333-4444-555555555555";
const CLIENTE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CPF = "529.982.247-25";
const SEGREDO = "segredo-do-aviso";

const CONFIG: ConfigDoPix = {
  ligado: true,
  clientId: "conta-da-plataforma",
  clientSecret: "x",
  segredoDoAviso: SEGREDO,
  baseUrl: "https://api.syncpayments.com.br",
  urlDoAviso: "https://painel.exemplo/api/webhooks/syncpay",
  segredoDaConciliacao: "s",
};

const PAGAMENTO: PagamentoGuardado = {
  id: "pay-1",
  checkout_id: CHECKOUT,
  status: "pendente",
  provider_reference: "SYNC-1",
  pix_code: "000201PIX",
  amount_cents: 10_000,
  store_percent: 97,
  recipient_user_id: "conta-da-loja-a",
  order_id: null,
};

type Rpcs = Record<string, (args: Record<string, unknown>) => unknown>;

function montar(opcoes: {
  rpcs?: Rpcs;
  banco?: Partial<BancoDoPix>;
  syncpay?: Partial<ClienteSyncPay>;
  config?: Partial<ConfigDoPix>;
}) {
  const chamadasRpc: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const banco: BancoDoPix = {
    async rpc(nome, args) {
      chamadasRpc.push({ nome, args });
      const f = opcoes.rpcs?.[nome];
      return { data: f ? f(args) : null, error: null };
    },
    checkoutDoCliente: async () => ({
      id: CHECKOUT,
      status: "aguardando_pagamento",
      order_id: null,
      total_cents: 10_000,
    }),
    pagamentoMaisRecente: async () => PAGAMENTO,
    pagamentoPorReferencia: async () => PAGAMENTO,
    pagamentoPorId: async () => PAGAMENTO,
    pagamentosParaConciliar: async () => [],
    numeroDoPedido: async () => 42,
    emailDoCliente: async () => "ana@x.com",
    ...opcoes.banco,
  };
  const syncpay = {
    obterToken: vi.fn(async () => "tok"),
    criarCobrancaPix: vi.fn(async () => ({ identificador: "SYNC-1", pixCopiaECola: "000201PIX" })),
    consultarTransacao: vi.fn(async () => ({
      referencia: "SYNC-1",
      situacao: "completed",
      valorCentavos: 10_000,
      split: [{ userId: "conta-da-loja-a", percentual: 97 }],
      resumo: { status: "completed" },
    })),
    ...opcoes.syncpay,
  } as unknown as ClienteSyncPay;
  const deps: Dependencias = {
    banco,
    syncpay: () => syncpay,
    config: { ...CONFIG, ...opcoes.config },
    log: () => {},
  };
  return { deps, chamadasRpc, syncpay };
}

const RESERVA_CRIAR = {
  acao: "criar",
  payment_id: "pay-1",
  amount_cents: 10_000,
  fee_percent: 3,
  store_percent: 97,
  recipient_user_id: "conta-da-loja-a",
  store_name: "Pizzaria A",
  customer_name: "Ana",
  customer_phone: "(11) 99999-0000",
};

describe("gerar o Pix", () => {
  it("cria a cobrança com o split da LOJA e o valor que o SERVIDOR calculou", async () => {
    const { deps, syncpay, chamadasRpc } = montar({
      rpcs: { flydelivery_pix_reserve: () => RESERVA_CRIAR },
    });
    // O aplicativo tentando mandar outro valor: o campo nem existe na entrada.
    const r = await gerarPix(
      { checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF, valor: 1 } as never,
      deps,
    );

    expect(r).toEqual({
      http: 200,
      corpo: {
        ok: true,
        situacao: "pendente",
        pagamentoId: "pay-1",
        pixCopiaECola: "000201PIX",
        valorCentavos: 10_000,
      },
    });
    expect(syncpay.criarCobrancaPix).toHaveBeenCalledWith({
      valorCentavos: 10_000,
      descricao: "Pedido FlyDelivery - Pizzaria A",
      webhookUrl: CONFIG.urlDoAviso,
      cliente: { nome: "Ana", cpf: "52998224725", email: "ana@x.com", telefone: "11999990000" },
      split: [{ userId: "conta-da-loja-a", percentual: 97 }],
    });
    expect(chamadasRpc.map((c) => c.nome)).toEqual([
      "flydelivery_pix_reserve",
      "flydelivery_pix_register_charge",
    ]);
    expect(chamadasRpc[1].args).toEqual({
      p_payment_id: "pay-1",
      p_reference: "SYNC-1",
      p_pix_code: "000201PIX",
    });
  });

  it("segundo toque / tela reaberta: devolve o MESMO Pix, sem nova cobrança", async () => {
    const { deps, syncpay } = montar({
      rpcs: {
        flydelivery_pix_reserve: () => ({
          acao: "existente",
          payment_id: "pay-1",
          pix_code: "000201PIX",
          amount_cents: 10_000,
        }),
      },
    });
    const r = await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps);
    expect(r.corpo).toMatchObject({ situacao: "pendente", pixCopiaECola: "000201PIX" });
    expect(syncpay.criarCobrancaPix).not.toHaveBeenCalled();
  });

  it("cobrança sendo criada por outro toque: pede para aguardar, sem chamar a SyncPay", async () => {
    const { deps, syncpay } = montar({
      rpcs: { flydelivery_pix_reserve: () => ({ acao: "em_andamento" }) },
    });
    const r = await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps);
    expect(r.http).toBe(409);
    expect(syncpay.criarCobrancaPix).not.toHaveBeenCalled();
  });

  it("estabelecimento sem conta SyncPay ativa: bloqueia com orientação", async () => {
    const { deps, syncpay } = montar({
      rpcs: { flydelivery_pix_reserve: () => ({ acao: "loja_sem_pix" }) },
    });
    const r = await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps);
    expect(r).toMatchObject({ http: 409, corpo: { codigo: "loja_sem_pix" } });
    expect(syncpay.criarCobrancaPix).not.toHaveBeenCalled();
  });

  it("recebedor igual à conta da plataforma: bloqueia e marca a falha", async () => {
    const { deps, syncpay, chamadasRpc } = montar({
      rpcs: {
        flydelivery_pix_reserve: () => ({
          ...RESERVA_CRIAR,
          recipient_user_id: "CONTA-DA-PLATAFORMA",
        }),
      },
    });
    const r = await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps);
    expect(r.corpo.codigo).toBe("loja_sem_pix");
    expect(syncpay.criarCobrancaPix).not.toHaveBeenCalled();
    expect(chamadasRpc.at(-1)).toMatchObject({
      nome: "flydelivery_pix_creation_failed",
      args: { p_status: "falhou" },
    });
  });

  it("resposta perdida da SyncPay: 'incerto', sem repetir sozinho", async () => {
    const { deps, syncpay, chamadasRpc } = montar({
      rpcs: { flydelivery_pix_reserve: () => RESERVA_CRIAR },
      syncpay: {
        criarCobrancaPix: vi.fn(async () => {
          throw new FalhaSyncPay("incerto", "sem resposta");
        }),
      },
    });
    const r = await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps);
    expect(r).toMatchObject({ http: 502, corpo: { codigo: "pix_incerto" } });
    expect(syncpay.criarCobrancaPix).toHaveBeenCalledTimes(1);
    expect(chamadasRpc.at(-1)).toMatchObject({
      nome: "flydelivery_pix_creation_failed",
      args: { p_status: "incerto" },
    });
  });

  it("CPF inválido ou Pix desligado: nem chega ao banco", async () => {
    const a = montar({ rpcs: { flydelivery_pix_reserve: () => RESERVA_CRIAR } });
    expect(
      (await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: "123" }, a.deps)).corpo
        .codigo,
    ).toBe("cpf_invalido");
    expect(a.chamadasRpc).toHaveLength(0);

    const b = montar({ config: { ligado: false } });
    expect(
      (await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, b.deps)).http,
    ).toBe(503);
    expect(b.chamadasRpc).toHaveLength(0);
  });

  it("pedido de outra pessoa responde como inexistente", async () => {
    const { deps } = montar({
      rpcs: { flydelivery_pix_reserve: () => ({ acao: "nao_encontrado" }) },
    });
    expect(
      (await gerarPix({ checkoutId: CHECKOUT, clienteId: CLIENTE, cpf: CPF }, deps)).http,
    ).toBe(404);
  });
});

describe("já pagou? (o aplicativo perguntando)", () => {
  it("pedido pago devolve o número do pedido", async () => {
    const { deps } = montar({
      banco: {
        checkoutDoCliente: async () => ({
          id: CHECKOUT,
          status: "pago",
          order_id: "ord-1",
          total_cents: 10_000,
        }),
      },
    });
    const r = await consultarSituacao({ checkoutId: CHECKOUT, clienteId: CLIENTE }, deps);
    expect(r.corpo).toMatchObject({ situacao: "pago", pedidoId: "ord-1", numeroDoPedido: 42 });
  });

  it("pendente: reconfere na SyncPay quando o freio deixa, e não quando não deixa", async () => {
    const liberado = montar({
      rpcs: {
        flydelivery_pix_claim_check: () => true,
        flydelivery_pix_apply_provider_status: () => ({ resultado: "sem_mudanca" }),
      },
    });
    await consultarSituacao({ checkoutId: CHECKOUT, clienteId: CLIENTE }, liberado.deps);
    expect(liberado.syncpay.consultarTransacao).toHaveBeenCalledTimes(1);

    const freado = montar({ rpcs: { flydelivery_pix_claim_check: () => false } });
    const r = await consultarSituacao({ checkoutId: CHECKOUT, clienteId: CLIENTE }, freado.deps);
    expect(freado.syncpay.consultarTransacao).not.toHaveBeenCalled();
    expect(r.corpo).toMatchObject({ situacao: "pendente", pixCopiaECola: "000201PIX" });
  });

  it("pago depois do prazo aparece como 'em conferência', nunca como 'expirado'", async () => {
    const { deps } = montar({
      banco: {
        checkoutDoCliente: async () => ({
          id: CHECKOUT,
          status: "expirado",
          order_id: null,
          total_cents: 10_000,
        }),
        pagamentoMaisRecente: async () => ({ ...PAGAMENTO, status: "pago" }),
      },
    });
    const r = await consultarSituacao({ checkoutId: CHECKOUT, clienteId: CLIENTE }, deps);
    expect(r.corpo.situacao).toBe("em_conferencia");
  });
});

describe("reconferência na SyncPay", () => {
  it("pagamento confirmado: manda situação, valor e 'divisão confere' para o banco decidir", async () => {
    const { deps, chamadasRpc } = montar({
      rpcs: {
        flydelivery_pix_apply_provider_status: () => ({ resultado: "confirmado", status: "pago" }),
      },
    });
    await expect(reconferir(PAGAMENTO, deps)).resolves.toEqual({
      resultado: "confirmado",
      status: "pago",
    });
    expect(chamadasRpc[0].args).toMatchObject({
      p_payment_id: "pay-1",
      p_provider_status: "completed",
      p_provider_amount_cents: 10_000,
      p_split_ok: true,
    });
  });

  it("divisão informada diferente da esperada (outro recebedor ou outro %) → p_split_ok = false", async () => {
    for (const split of [
      [{ userId: "conta-de-outro", percentual: 97 }],
      [{ userId: "conta-da-loja-a", percentual: 90 }],
      [],
    ]) {
      const { deps, chamadasRpc } = montar({
        syncpay: {
          consultarTransacao: vi.fn(async () => ({
            referencia: "SYNC-1",
            situacao: "completed",
            valorCentavos: 10_000,
            split,
            resumo: {},
          })),
        },
      });
      await reconferir(PAGAMENTO, deps);
      expect(chamadasRpc[0].args.p_split_ok).toBe(false);
    }
  });

  it("SyncPay sem informar a divisão → p_split_ok = null (não inventa)", async () => {
    const { deps, chamadasRpc } = montar({
      syncpay: {
        consultarTransacao: vi.fn(async () => ({
          referencia: "SYNC-1",
          situacao: "pending",
          valorCentavos: null,
          split: null,
          resumo: {},
        })),
      },
    });
    await reconferir(PAGAMENTO, deps);
    expect(chamadasRpc[0].args.p_split_ok).toBeNull();
  });

  it("consulta devolvendo OUTRA transação não aplica nada", async () => {
    const { deps, chamadasRpc } = montar({
      syncpay: {
        consultarTransacao: vi.fn(async () => ({
          referencia: "OUTRA",
          situacao: "completed",
          valorCentavos: 10_000,
          split: null,
          resumo: {},
        })),
      },
    });
    await expect(reconferir(PAGAMENTO, deps)).resolves.toEqual({
      resultado: "referencia_diferente",
    });
    expect(chamadasRpc).toHaveLength(0);
  });
});

describe("aviso (webhook) da SyncPay", () => {
  const corpo = JSON.stringify({
    event_id: "evt-1",
    event: "transaction",
    data: { identifier: "SYNC-1", status: "completed", client: { cpf: "52998224725" } },
  });
  const assinado = (texto: string) =>
    new Headers({
      "x-syncpay-signature": createHmac("sha256", SEGREDO).update(texto).digest("hex"),
    });

  it("sem assinatura válida: 401 e NADA é tocado (nem banco, nem SyncPay)", async () => {
    const { deps, chamadasRpc, syncpay } = montar({});
    const r = await processarAviso(
      { corpoBruto: corpo, cabecalhos: new Headers({ "x-syncpay-signature": "falsa" }) },
      deps,
    );
    expect(r.http).toBe(401);
    expect(chamadasRpc).toHaveLength(0);
    expect(syncpay.consultarTransacao).not.toHaveBeenCalled();
  });

  it("aviso válido: registra (sem CPF), reconfere na SyncPay e aplica", async () => {
    const { deps, chamadasRpc, syncpay } = montar({
      rpcs: {
        flydelivery_payment_event_record: () => true,
        flydelivery_pix_apply_provider_status: () => ({ resultado: "confirmado", status: "pago" }),
      },
    });
    const r = await processarAviso({ corpoBruto: corpo, cabecalhos: assinado(corpo) }, deps);
    expect(r.http).toBe(200);
    expect(syncpay.consultarTransacao).toHaveBeenCalledWith("SYNC-1");
    const registro = chamadasRpc.find((c) => c.nome === "flydelivery_payment_event_record")!;
    expect(registro.args).toMatchObject({
      p_event_key: "id:evt-1",
      p_reference: "SYNC-1",
      p_auth_method: "hmac",
    });
    expect(JSON.stringify(registro.args.p_payload)).not.toContain("52998224725");
    expect(chamadasRpc.at(-1)).toMatchObject({
      nome: "flydelivery_payment_event_finish",
      args: { p_outcome: "confirmado" },
    });
  });

  it("aviso repetido: 200 sem reconferir de novo", async () => {
    const { deps, syncpay } = montar({ rpcs: { flydelivery_payment_event_record: () => false } });
    const r = await processarAviso({ corpoBruto: corpo, cabecalhos: assinado(corpo) }, deps);
    expect(r).toEqual({ http: 200, corpo: { ok: true, repetido: true } });
    expect(syncpay.consultarTransacao).not.toHaveBeenCalled();
  });

  it("falha na reconferência: 500 (a SyncPay manda de novo) e anota o erro", async () => {
    const { deps, chamadasRpc } = montar({
      rpcs: { flydelivery_payment_event_record: () => true },
      syncpay: {
        consultarTransacao: vi.fn(async () => {
          throw new FalhaSyncPay("indisponivel", "fora do ar");
        }),
      },
    });
    const r = await processarAviso({ corpoBruto: corpo, cabecalhos: assinado(corpo) }, deps);
    expect(r.http).toBe(500);
    expect(chamadasRpc.at(-1)).toMatchObject({
      nome: "flydelivery_payment_event_finish",
      args: { p_outcome: "erro" },
    });
  });

  it("transação que não é nossa: 200 e anotado como não encontrado", async () => {
    const { deps, chamadasRpc, syncpay } = montar({
      rpcs: { flydelivery_payment_event_record: () => true },
      banco: { pagamentoPorReferencia: async () => null },
    });
    const r = await processarAviso({ corpoBruto: corpo, cabecalhos: assinado(corpo) }, deps);
    expect(r.http).toBe(200);
    expect(syncpay.consultarTransacao).not.toHaveBeenCalled();
    expect(chamadasRpc.at(-1)?.args.p_outcome).toBe("nao_encontrado");
  });

  it("servidor sem SYNCPAY_WEBHOOK_SECRET recusa todo aviso (503)", async () => {
    const { deps } = montar({ config: { segredoDoAviso: "" } });
    expect(
      (await processarAviso({ corpoBruto: corpo, cabecalhos: assinado(corpo) }, deps)).http,
    ).toBe(503);
  });
});

describe("conciliação periódica", () => {
  it("vence pedidos não pagos e reconfere cada pendente, sem parar no primeiro erro", async () => {
    const consultar = vi
      .fn()
      .mockRejectedValueOnce(new FalhaSyncPay("indisponivel", "x"))
      .mockResolvedValue({
        referencia: null,
        situacao: "pending",
        valorCentavos: null,
        split: null,
        resumo: {},
      });
    const { deps } = montar({
      rpcs: {
        flydelivery_checkouts_expire: () => 2,
        flydelivery_pix_apply_provider_status: () => ({ resultado: "sem_mudanca" }),
      },
      banco: { pagamentosParaConciliar: async () => [PAGAMENTO, { ...PAGAMENTO, id: "pay-2" }] },
      syncpay: { consultarTransacao: consultar },
    });
    await expect(conciliarPendentes(deps)).resolves.toEqual({
      vencidos: 2,
      conferidos: 1,
      falhas: 1,
      resultados: { sem_mudanca: 1 },
    });
  });
});

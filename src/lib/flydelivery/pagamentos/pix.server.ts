/**
 * O caminho do dinheiro do Pix do FlyDelivery, de ponta a ponta.
 *
 *   1. gerarPix          — o cliente toca em "Pagar com Pix": o banco reserva a
 *                          cobrança (trava contra duplo toque), a SyncPay cria
 *                          o Pix com o split e o QR Code volta para o celular.
 *   2. consultarSituacao — o aplicativo pergunta "já pagou?" a cada poucos
 *                          segundos. De tempos em tempos isso vira uma
 *                          consulta à SyncPay (rede de segurança se o aviso
 *                          se perder).
 *   3. processarAviso    — a SyncPay avisa que algo mudou. O aviso é conferido
 *                          (assinatura, repetição) e serve só de gatilho para
 *                          a RECONFERÊNCIA.
 *   4. reconferir        — pergunta à SyncPay a situação real, compara valor e
 *                          divisão e entrega ao banco, que decide numa
 *                          transação só (e uma vez só) se o pedido nasce pago.
 *   5. conciliarPendentes — faxina periódica: reconfere quem ficou pendente e
 *                          vence pedido que ninguém pagou.
 *
 * Quem decide se um pedido está pago NUNCA é o celular, nem o aviso sozinho:
 * é a consulta à SyncPay, conferida pelo banco.
 */

import { cpfValido, somenteDigitos } from "./cpf";
import { conferirAutenticidade, chaveDoAviso, lerAviso } from "./webhook";
import {
  FalhaSyncPay,
  semDadosPessoais,
  type ClienteSyncPay,
  type RecebedorDoSplit,
} from "./syncpay";
import type { ConfigDoPix } from "./config.server";

// ------------------------------------------------------------------ tipos --

export type ErroDoBanco = { message: string; code?: string } | null;

/** O que o serviço precisa do banco. Na produção é o Supabase com a chave do servidor. */
export type BancoDoPix = {
  rpc(nome: string, args: Record<string, unknown>): Promise<{ data: unknown; error: ErroDoBanco }>;
  checkoutDoCliente(
    checkoutId: string,
    clienteId: string,
  ): Promise<{ id: string; status: string; order_id: string | null; total_cents: number } | null>;
  pagamentoMaisRecente(checkoutId: string): Promise<PagamentoGuardado | null>;
  pagamentoPorReferencia(referencia: string): Promise<PagamentoGuardado | null>;
  pagamentoPorId(id: string): Promise<PagamentoGuardado | null>;
  pagamentosParaConciliar(limite: number): Promise<PagamentoGuardado[]>;
  numeroDoPedido(orderId: string): Promise<number | null>;
  emailDoCliente(clienteId: string): Promise<string | null>;
};

export type PagamentoGuardado = {
  id: string;
  checkout_id: string;
  status: string;
  provider_reference: string | null;
  pix_code: string | null;
  amount_cents: number;
  store_percent: number;
  recipient_user_id: string;
  order_id: string | null;
};

export type Dependencias = {
  banco: BancoDoPix;
  syncpay: () => ClienteSyncPay;
  config: ConfigDoPix;
  log?: (mensagem: string, extra?: Record<string, unknown>) => void;
};

/** Resposta para o aplicativo. `situacao` é o que a tela usa para decidir o que mostrar. */
export type RespostaDoPix = {
  http: number;
  corpo: {
    ok: boolean;
    situacao?: "pendente" | "pago" | "em_conferencia" | "falhou" | "expirado";
    codigo?: string;
    mensagem?: string;
    pagamentoId?: string;
    pixCopiaECola?: string;
    valorCentavos?: number;
    pedidoId?: string | null;
    numeroDoPedido?: number | null;
  };
};

const INTERVALO_MINIMO_DE_CONSULTA_S = 15;

function erro(http: number, codigo: string, mensagem: string): RespostaDoPix {
  return { http, corpo: { ok: false, codigo, mensagem } };
}

function logar(deps: Dependencias, mensagem: string, extra?: Record<string, unknown>) {
  (deps.log ?? ((m, e) => console.log(`[pix-syncpay] ${m}`, e ?? "")))(mensagem, extra);
}

// ---------------------------------------------------------- 1. gerar o Pix --

export async function gerarPix(
  entrada: { checkoutId: string; clienteId: string; cpf: unknown },
  deps: Dependencias,
): Promise<RespostaDoPix> {
  const { config, banco } = deps;

  if (!config.ligado || !config.clientId || !config.clientSecret || !config.urlDoAviso) {
    return erro(
      503,
      "pix_desligado",
      "O pagamento por Pix no aplicativo ainda não está disponível.",
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(entrada.checkoutId)) {
    return erro(400, "pedido_invalido", "Pedido inválido.");
  }
  if (!cpfValido(entrada.cpf)) {
    return erro(400, "cpf_invalido", "Confira o CPF: ele é pedido pelo banco para gerar o Pix.");
  }

  const { data, error } = await banco.rpc("flydelivery_pix_reserve", {
    p_checkout_id: entrada.checkoutId,
    p_customer_id: entrada.clienteId,
  });
  if (error) {
    logar(deps, "falha ao reservar cobrança", { erro: error.message });
    return erro(500, "erro_interno", "Não foi possível preparar o pagamento. Tente de novo.");
  }
  const reserva = (data ?? {}) as Record<string, unknown>;

  switch (reserva.acao) {
    case "nao_encontrado":
      return erro(404, "pedido_nao_encontrado", "Pedido não encontrado.");
    case "pago":
      return {
        http: 200,
        corpo: {
          ok: true,
          situacao: "pago",
          pedidoId: (reserva.order_id as string) ?? null,
          numeroDoPedido: reserva.order_id
            ? await banco.numeroDoPedido(String(reserva.order_id))
            : null,
        },
      };
    case "indisponivel":
      return erro(
        409,
        "pedido_encerrado",
        "Este pedido não pode mais ser pago. Faça um pedido novo.",
      );
    case "existente":
      // Tela reaberta, segundo toque: devolve o MESMO Pix.
      return {
        http: 200,
        corpo: {
          ok: true,
          situacao: "pendente",
          pagamentoId: String(reserva.payment_id),
          pixCopiaECola: String(reserva.pix_code ?? ""),
          valorCentavos: Number(reserva.amount_cents),
        },
      };
    case "em_andamento":
      return erro(409, "pix_sendo_gerado", "Seu Pix está sendo gerado. Aguarde um instante.");
    case "conferencia":
      return {
        http: 200,
        corpo: {
          ok: true,
          situacao: "em_conferencia",
          mensagem: "Seu pagamento está em conferência. Não pague de novo.",
        },
      };
    case "limite_tentativas":
      return erro(
        429,
        "limite_de_tentativas",
        "Muitas tentativas para este pedido. Fale com o estabelecimento.",
      );
    case "loja_sem_pix":
      return erro(
        409,
        "loja_sem_pix",
        "Este estabelecimento não está recebendo Pix pelo aplicativo agora.",
      );
    case "criar":
      break;
    default:
      logar(deps, "resposta inesperada da reserva", { acao: String(reserva.acao) });
      return erro(500, "erro_interno", "Não foi possível preparar o pagamento.");
  }

  const pagamentoId = String(reserva.payment_id);
  const recebedor = String(reserva.recipient_user_id ?? "");
  const percentualLoja = Number(reserva.store_percent);
  const valorCentavos = Number(reserva.amount_cents);

  // Última trava antes do dinheiro: o recebedor dos 97% nunca pode ser a
  // própria plataforma (o dinheiro da loja ficaria com o FlyDelivery).
  if (!recebedor || recebedor.toLowerCase() === config.clientId.toLowerCase()) {
    await banco.rpc("flydelivery_pix_creation_failed", {
      p_payment_id: pagamentoId,
      p_status: "falhou",
      p_reason:
        "Recebedor do split igual à conta da plataforma — conta do estabelecimento precisa ser corrigida.",
    });
    logar(deps, "recebedor inválido bloqueado", { pagamentoId });
    return erro(
      409,
      "loja_sem_pix",
      "Este estabelecimento não está recebendo Pix pelo aplicativo agora.",
    );
  }

  const email = (await banco.emailDoCliente(entrada.clienteId)) ?? "";
  const telefone = somenteDigitos(reserva.customer_phone);

  try {
    const cobranca = await deps.syncpay().criarCobrancaPix({
      valorCentavos,
      descricao: `Pedido FlyDelivery - ${String(reserva.store_name ?? "Estabelecimento")}`,
      webhookUrl: config.urlDoAviso,
      cliente: {
        nome: String(reserva.customer_name ?? "Cliente FlyDelivery"),
        cpf: somenteDigitos(entrada.cpf),
        email,
        telefone,
      },
      split: [{ userId: recebedor, percentual: percentualLoja }],
    });

    const anotado = await banco.rpc("flydelivery_pix_register_charge", {
      p_payment_id: pagamentoId,
      p_reference: cobranca.identificador,
      p_pix_code: cobranca.pixCopiaECola,
    });
    if (anotado.error) {
      // A cobrança existe na SyncPay mas não foi anotada aqui. O identificador
      // vai para a conciliação para não se perder.
      await banco.rpc("flydelivery_pix_creation_failed", {
        p_payment_id: pagamentoId,
        p_status: "incerto",
        p_reason: `Cobrança criada na SyncPay (identificador ${cobranca.identificador}) mas não foi possível anotar.`,
      });
      logar(deps, "cobrança criada e não anotada", {
        pagamentoId,
        referencia: cobranca.identificador,
      });
      return erro(
        500,
        "pix_incerto",
        "Não conseguimos confirmar o seu Pix. Toque para tentar de novo.",
      );
    }

    return {
      http: 200,
      corpo: {
        ok: true,
        situacao: "pendente",
        pagamentoId,
        pixCopiaECola: cobranca.pixCopiaECola,
        valorCentavos,
      },
    };
  } catch (falha) {
    const tipo = falha instanceof FalhaSyncPay ? falha.tipo : "incerto";
    const motivo = falha instanceof Error ? falha.message : "falha desconhecida";
    const incerto = tipo === "incerto";

    await banco.rpc("flydelivery_pix_creation_failed", {
      p_payment_id: pagamentoId,
      p_status: incerto ? "incerto" : "falhou",
      p_reason: motivo.slice(0, 500),
    });
    logar(deps, "SyncPay não criou a cobrança", { pagamentoId, tipo });

    if (incerto) {
      return erro(
        502,
        "pix_incerto",
        "Não conseguimos confirmar o seu Pix. Toque para tentar de novo.",
      );
    }
    if (tipo === "limite") {
      return erro(429, "aguarde", "Muitos pedidos de Pix agora. Tente de novo em alguns segundos.");
    }
    if (tipo === "validacao") {
      return erro(
        422,
        "dados_recusados",
        "O banco recusou os dados do pagamento. Confira o CPF e tente de novo.",
      );
    }
    return erro(
      503,
      "pix_indisponivel",
      "O Pix está indisponível no momento. Tente de novo em instantes.",
    );
  }
}

// ------------------------------------------------- 2. consultar situação --

export async function consultarSituacao(
  entrada: { checkoutId: string; clienteId: string },
  deps: Dependencias,
): Promise<RespostaDoPix> {
  const { banco } = deps;
  if (!/^[0-9a-f-]{36}$/i.test(entrada.checkoutId)) {
    return erro(400, "pedido_invalido", "Pedido inválido.");
  }

  const checkout = await banco.checkoutDoCliente(entrada.checkoutId, entrada.clienteId);
  if (!checkout) return erro(404, "pedido_nao_encontrado", "Pedido não encontrado.");

  let pagamento = await banco.pagamentoMaisRecente(checkout.id);

  // Rede de segurança: se o aviso da SyncPay se perder, o próprio "já pagou?"
  // do aplicativo provoca uma consulta — no máximo uma a cada 15 segundos.
  if (
    checkout.status === "aguardando_pagamento" &&
    pagamento?.provider_reference &&
    (pagamento.status === "pendente" || pagamento.status === "incerto")
  ) {
    const { data: posso } = await banco.rpc("flydelivery_pix_claim_check", {
      p_payment_id: pagamento.id,
      p_min_seconds: INTERVALO_MINIMO_DE_CONSULTA_S,
    });
    if (posso === true) {
      await reconferir(pagamento, deps).catch((e) =>
        logar(deps, "reconferência durante a consulta falhou", { erro: String(e) }),
      );
      pagamento = await banco.pagamentoMaisRecente(checkout.id);
    }
  }

  const atualizado = await banco.checkoutDoCliente(entrada.checkoutId, entrada.clienteId);
  if (atualizado?.status === "pago" && atualizado.order_id) {
    return {
      http: 200,
      corpo: {
        ok: true,
        situacao: "pago",
        pedidoId: atualizado.order_id,
        numeroDoPedido: await banco.numeroDoPedido(atualizado.order_id),
      },
    };
  }
  // Dinheiro que entrou sem virar pedido (pago fora do prazo, em duplicidade,
  // valor divergente, estorno, disputa): o cliente precisa ler "em
  // conferência, não pague de novo" — nunca "expirado".
  const emConferencia = ["pago", "duplicado", "divergente", "em_disputa", "estornado"];
  if (
    (atualizado?.status === "expirado" || atualizado?.status === "cancelado") &&
    !(pagamento && emConferencia.includes(pagamento.status))
  ) {
    return { http: 200, corpo: { ok: true, situacao: "expirado" } };
  }

  if (!pagamento) {
    return {
      http: 200,
      corpo: { ok: true, situacao: "pendente", valorCentavos: checkout.total_cents },
    };
  }

  switch (pagamento.status) {
    case "pendente":
    case "criando":
      return {
        http: 200,
        corpo: {
          ok: true,
          situacao: "pendente",
          pagamentoId: pagamento.id,
          pixCopiaECola: pagamento.pix_code ?? undefined,
          valorCentavos: pagamento.amount_cents,
        },
      };
    case "falhou":
    case "incerto":
    case "expirado":
      return { http: 200, corpo: { ok: true, situacao: "falhou", pagamentoId: pagamento.id } };
    default:
      // pago sem pedido (fora do prazo/duplicado), divergente, em disputa, estornado.
      return {
        http: 200,
        corpo: {
          ok: true,
          situacao: "em_conferencia",
          pagamentoId: pagamento.id,
          mensagem: "Seu pagamento está em conferência. Não pague de novo — vamos falar com você.",
        },
      };
  }
}

// --------------------------------------------------------- 4. reconferir --

function mesmaDivisao(
  esperado: RecebedorDoSplit,
  informado: RecebedorDoSplit[] | null,
): boolean | null {
  if (informado === null) return null;
  return (
    informado.length === 1 &&
    informado[0].userId.toLowerCase() === esperado.userId.toLowerCase() &&
    informado[0].percentual === esperado.percentual
  );
}

export async function reconferir(
  pagamento: PagamentoGuardado,
  deps: Dependencias,
): Promise<{ resultado: string; status?: string }> {
  if (!pagamento.provider_reference) return { resultado: "sem_referencia" };

  let consulta;
  try {
    consulta = await deps.syncpay().consultarTransacao(pagamento.provider_reference);
  } catch (falha) {
    if (falha instanceof FalhaSyncPay && falha.tipo === "nao_encontrada") {
      return { resultado: "nao_encontrada_na_syncpay" };
    }
    throw falha;
  }

  if (consulta.referencia && consulta.referencia !== pagamento.provider_reference) {
    // A SyncPay devolveu OUTRA transação. Não aplica nada.
    logar(deps, "consulta devolveu referência diferente", { pagamentoId: pagamento.id });
    return { resultado: "referencia_diferente" };
  }

  const divisaoConfere = mesmaDivisao(
    { userId: pagamento.recipient_user_id, percentual: pagamento.store_percent },
    consulta.split,
  );

  const { data, error } = await deps.banco.rpc("flydelivery_pix_apply_provider_status", {
    p_payment_id: pagamento.id,
    p_provider_status: consulta.situacao,
    p_provider_amount_cents: consulta.valorCentavos,
    p_provider_snapshot: consulta.resumo,
    p_split_ok: divisaoConfere,
  });
  if (error) throw new Error(`falha ao aplicar a situação: ${error.message}`);

  const r = (data ?? {}) as Record<string, unknown>;
  return {
    resultado: String(r.resultado ?? "desconhecido"),
    status: r.status ? String(r.status) : undefined,
  };
}

// ----------------------------------------------------- 3. aviso da SyncPay --

export type RespostaDoAviso = { http: number; corpo: Record<string, unknown> };

export async function processarAviso(
  entrada: { corpoBruto: string; cabecalhos: { get(nome: string): string | null } },
  deps: Dependencias,
): Promise<RespostaDoAviso> {
  const autenticidade = await conferirAutenticidade({
    corpoBruto: entrada.corpoBruto,
    cabecalhos: entrada.cabecalhos,
    segredo: deps.config.segredoDoAviso,
  });
  if (!autenticidade.ok) {
    if (autenticidade.motivo === "sem_segredo") {
      logar(deps, "aviso recusado: SYNCPAY_WEBHOOK_SECRET não configurado");
      return { http: 503, corpo: { ok: false } };
    }
    logar(deps, "aviso recusado", { motivo: autenticidade.motivo });
    return { http: 401, corpo: { ok: false } };
  }

  let json: unknown;
  try {
    json = JSON.parse(entrada.corpoBruto);
  } catch {
    return { http: 400, corpo: { ok: false } };
  }

  const aviso = lerAviso(json);
  const chave = await chaveDoAviso(aviso, entrada.corpoBruto);

  const registro = await deps.banco.rpc("flydelivery_payment_event_record", {
    p_event_key: chave,
    p_event_type: aviso.tipo,
    p_reference: aviso.referencia,
    p_auth_method: autenticidade.metodo,
    p_payload: semDadosPessoais(json),
  });
  if (registro.error) {
    logar(deps, "falha ao registrar aviso", { erro: registro.error.message });
    return { http: 500, corpo: { ok: false } };
  }
  if (registro.data !== true) {
    return { http: 200, corpo: { ok: true, repetido: true } };
  }

  const terminar = (resultado: string, erroTexto: string | null = null) =>
    deps.banco.rpc("flydelivery_payment_event_finish", {
      p_event_key: chave,
      p_outcome: resultado,
      p_error: erroTexto,
    });

  if (!aviso.referencia) {
    await terminar("sem_referencia");
    return { http: 200, corpo: { ok: true } };
  }

  const pagamento = await deps.banco.pagamentoPorReferencia(aviso.referencia);
  if (!pagamento) {
    await terminar("nao_encontrado");
    return { http: 200, corpo: { ok: true } };
  }

  try {
    const r = await reconferir(pagamento, deps);
    await terminar(r.resultado);
    return { http: 200, corpo: { ok: true } };
  } catch (falha) {
    const texto = falha instanceof Error ? falha.message : String(falha);
    await terminar("erro", texto.slice(0, 500));
    logar(deps, "falha ao reconferir aviso", { pagamentoId: pagamento.id });
    // 500 faz a SyncPay mandar de novo — e o registro acima deixa reprocessar.
    return { http: 500, corpo: { ok: false } };
  }
}

// ------------------------------------------------ 5. conciliar pendentes --

export async function conciliarPendentes(
  deps: Dependencias,
  limite = 50,
): Promise<{
  vencidos: number;
  conferidos: number;
  falhas: number;
  resultados: Record<string, number>;
}> {
  const { data: vencidos } = await deps.banco.rpc("flydelivery_checkouts_expire", {});
  const lista = await deps.banco.pagamentosParaConciliar(limite);
  const resultados: Record<string, number> = {};
  let falhas = 0;
  for (const pagamento of lista) {
    try {
      const r = await reconferir(pagamento, deps);
      resultados[r.resultado] = (resultados[r.resultado] ?? 0) + 1;
    } catch (e) {
      falhas++;
      logar(deps, "conciliação: falha ao reconferir", {
        pagamentoId: pagamento.id,
        erro: String(e),
      });
    }
  }
  return { vencidos: Number(vencidos ?? 0), conferidos: lista.length - falhas, falhas, resultados };
}

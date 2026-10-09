/**
 * Leituras e ações dos painéis financeiros, feitas DIRETO no banco com o login
 * de quem está na tela.
 *
 * Não existe filtro "de mentira" aqui: quem decide o que cada um enxerga são
 * as regras do banco (RLS). O dono da loja A pode até pedir os pagamentos da
 * loja B — o banco simplesmente devolve nada. As alterações chamam funções do
 * banco que conferem se quem pede é o dono (ou o administrador) antes de
 * mexer, e anotam tudo na auditoria.
 */

import { supabase } from "@/integrations/supabase/client";
import type { LinhaDePagamento, QuemPagaATarifa } from "./resumo";
import { semTipos, type ResultadoDaConsulta } from "./ponte";

// As tabelas do Pix ainda não estão no arquivo de tipos gerado.
const db = () => semTipos(supabase);

export type ContaRecebedora = {
  pizzeria_id: string;
  syncpay_user_id: string | null;
  status: string;
  status_note: string | null;
  fee_percent_override: number | null;
  pix_online_enabled: boolean;
  verified_at: string | null;
  updated_at: string;
};

export type ConfiguracaoGeral = {
  default_fee_percent: number;
  gateway_fee_bearer: QuemPagaATarifa;
};

function mensagemDoBanco(
  error: { message?: string; code?: string } | null,
  padrao: string,
): string {
  const texto = String(error?.message ?? "");
  if (error?.code === "42501" || texto.includes("sem permissão"))
    return "Você não tem permissão para esta ação.";
  if (texto.includes("conta_nao_ativa"))
    return "A conta ainda não foi ativada pela equipe FlyDelivery.";
  if (texto.includes("conta_nao_configurada"))
    return "Informe primeiro o Client ID da conta SyncPay.";
  if (texto.includes("comissão precisa"))
    return "A comissão precisa ser um número inteiro entre 1% e 50%.";
  if (texto.includes("descreva o que foi feito"))
    return "Descreva o que foi feito (mínimo 5 letras).";
  return padrao;
}

async function exigir(
  promessa: PromiseLike<ResultadoDaConsulta>,
  padrao: string,
): Promise<unknown> {
  const { data, error } = await promessa;
  if (error) throw new Error(mensagemDoBanco(error, padrao));
  return data;
}

export async function lerConfiguracaoGeral(): Promise<ConfiguracaoGeral> {
  const data = await exigir(
    db()
      .from("flydelivery_payment_settings")
      .select("default_fee_percent, gateway_fee_bearer")
      .maybeSingle(),
    "Não foi possível ler a configuração.",
  );
  return (
    (data as ConfiguracaoGeral) ?? { default_fee_percent: 3, gateway_fee_bearer: "nao_definido" }
  );
}

export async function lerContaDaLoja(storeId: string): Promise<ContaRecebedora | null> {
  const data = await exigir(
    db().from("flydelivery_payment_accounts").select("*").eq("pizzeria_id", storeId).maybeSingle(),
    "Não foi possível ler a conta recebedora.",
  );
  return (data as ContaRecebedora) ?? null;
}

export async function lerContas(): Promise<ContaRecebedora[]> {
  const data = await exigir(
    db().from("flydelivery_payment_accounts").select("*").order("updated_at", { ascending: false }),
    "Não foi possível ler as contas.",
  );
  return (data as ContaRecebedora[]) ?? [];
}

const COLUNAS =
  "id, store_id, status, created_at, paid_at, amount_cents, fee_percent, platform_amount_cents, " +
  "store_amount_cents, gateway_fee_cents, needs_reconciliation, reconciliation_note, provider_reference, " +
  "order_id, orders!flydelivery_payments_order_id_fkey(order_number), pizzerias(name)";

type LinhaBruta = Omit<LinhaDePagamento, "order_number" | "store_name"> & {
  provider_reference: string | null;
  order_id: string | null;
  orders: { order_number: number | null } | null;
  pizzerias: { name: string | null } | null;
};

export type PagamentoNaTela = LinhaDePagamento & {
  provider_reference: string | null;
  order_id: string | null;
};

export async function lerPagamentos(filtro: {
  storeId?: string;
  de: Date;
  ate: Date;
  limite?: number;
}): Promise<PagamentoNaTela[]> {
  let consulta = db()
    .from("flydelivery_payments")
    .select(COLUNAS)
    .gte("created_at", filtro.de.toISOString())
    .lt("created_at", filtro.ate.toISOString())
    .order("created_at", { ascending: false })
    .limit(filtro.limite ?? 2000);
  if (filtro.storeId) consulta = consulta.eq("store_id", filtro.storeId);
  const data = (await exigir(consulta, "Não foi possível ler os pagamentos.")) as
    LinhaBruta[] | null;
  return (data ?? []).map((l) => ({
    ...l,
    order_number: l.orders?.order_number ?? null,
    store_name: l.pizzerias?.name ?? null,
  }));
}

export type RegistroDeAuditoria = {
  id: number;
  actor_kind: string;
  action: string;
  store_id: string | null;
  payment_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
};

export async function lerAuditoria(storeId?: string): Promise<RegistroDeAuditoria[]> {
  let consulta = db()
    .from("flydelivery_finance_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (storeId) consulta = consulta.eq("store_id", storeId);
  return (
    ((await exigir(consulta, "Não foi possível ler a auditoria.")) as RegistroDeAuditoria[]) ?? []
  );
}

export type AvisoRecebido = {
  id: number;
  event_type: string | null;
  provider_reference: string | null;
  auth_method: string | null;
  received_at: string;
  processed_at: string | null;
  outcome: string | null;
  error: string | null;
};

export async function lerAvisosComProblema(): Promise<AvisoRecebido[]> {
  const data = await exigir(
    db()
      .from("flydelivery_payment_events")
      .select(
        "id, event_type, provider_reference, auth_method, received_at, processed_at, outcome, error",
      )
      .or(
        "outcome.eq.erro,outcome.eq.nao_encontrado,outcome.eq.status_desconhecido,processed_at.is.null",
      )
      .order("received_at", { ascending: false })
      .limit(100),
    "Não foi possível ler os avisos.",
  );
  return (data as AvisoRecebido[]) ?? [];
}

// --------------------------------------------------------------- ações --

export function ligarPixNoApp(storeId: string, ligado: boolean) {
  return exigir(
    db().rpc("flydelivery_store_set_pix_enabled", { p_store_id: storeId, p_enabled: ligado }),
    "Não foi possível alterar o Pix no aplicativo.",
  );
}

export function salvarComissaoPadrao(percentual: number, quemPaga: QuemPagaATarifa) {
  return exigir(
    db().rpc("flydelivery_admin_set_default_fee", {
      p_fee_percent: percentual,
      p_gateway_fee_bearer: quemPaga,
    }),
    "Não foi possível salvar a comissão padrão.",
  );
}

export function salvarComissaoDaLoja(storeId: string, percentual: number | null) {
  return exigir(
    db().rpc("flydelivery_admin_set_store_fee", { p_store_id: storeId, p_fee_percent: percentual }),
    "Não foi possível salvar a comissão da loja.",
  );
}

export function mudarSituacaoDaConta(storeId: string, situacao: string, nota: string) {
  return exigir(
    db().rpc("flydelivery_admin_set_account_status", {
      p_store_id: storeId,
      p_status: situacao,
      p_note: nota,
    }),
    "Não foi possível mudar a situação da conta.",
  );
}

export function resolverConciliacao(paymentId: string, nota: string) {
  return exigir(
    db().rpc("flydelivery_admin_resolve_reconciliation", { p_payment_id: paymentId, p_note: nota }),
    "Não foi possível encerrar a pendência.",
  );
}

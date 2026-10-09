/**
 * O banco do Pix na produção: Supabase com a chave do servidor.
 *
 * As tabelas e funções do Pix são novas e ainda não estão no arquivo de tipos
 * gerado (`integrations/supabase/types.ts`); por isso o acesso passa pela
 * ponte de tipos (`ponte.ts`) e cada leitura escolhe as colunas que usa.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { criarClienteSyncPay, type ClienteSyncPay } from "./syncpay";
import { lerConfigDoPix } from "./config.server";
import { semTipos } from "./ponte";
import type { BancoDoPix, Dependencias, PagamentoGuardado } from "./pix.server";

const db = () => semTipos(supabaseAdmin);

type LinhaDoPedido = { order_number?: unknown } | null;

const COLUNAS_DO_PAGAMENTO =
  "id, checkout_id, status, provider_reference, pix_code, amount_cents, store_percent, recipient_user_id, order_id";

export const bancoDoPix: BancoDoPix = {
  async rpc(nome, args) {
    const { data, error } = await db().rpc(nome, args);
    return { data, error: error ? { message: error.message, code: error.code } : null };
  },

  async checkoutDoCliente(checkoutId, clienteId) {
    const { data } = await db()
      .from("flydelivery_checkouts")
      .select("id, status, order_id, total_cents")
      .eq("id", checkoutId)
      .eq("customer_id", clienteId)
      .maybeSingle();
    return (data as Awaited<ReturnType<BancoDoPix["checkoutDoCliente"]>>) ?? null;
  },

  async pagamentoMaisRecente(checkoutId) {
    const { data } = await db()
      .from("flydelivery_payments")
      .select(COLUNAS_DO_PAGAMENTO)
      .eq("checkout_id", checkoutId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as PagamentoGuardado | null) ?? null;
  },

  async pagamentoPorReferencia(referencia) {
    const { data } = await db()
      .from("flydelivery_payments")
      .select(COLUNAS_DO_PAGAMENTO)
      .eq("provider_reference", referencia)
      .maybeSingle();
    return (data as PagamentoGuardado | null) ?? null;
  },

  async pagamentoPorId(id) {
    const { data } = await db()
      .from("flydelivery_payments")
      .select(COLUNAS_DO_PAGAMENTO)
      .eq("id", id)
      .maybeSingle();
    return (data as PagamentoGuardado | null) ?? null;
  },

  async pagamentosParaConciliar(limite) {
    const umMinutoAtras = new Date(Date.now() - 60_000).toISOString();
    const doisMinutosAtras = new Date(Date.now() - 120_000).toISOString();
    const { data } = await db()
      .from("flydelivery_payments")
      .select(COLUNAS_DO_PAGAMENTO)
      .in("status", ["pendente", "incerto"])
      .not("provider_reference", "is", null)
      .lt("created_at", umMinutoAtras)
      .or(`last_checked_at.is.null,last_checked_at.lt.${doisMinutosAtras}`)
      .order("created_at", { ascending: true })
      .limit(limite);
    return (data as PagamentoGuardado[]) ?? [];
  },

  async numeroDoPedido(orderId) {
    const { data } = await db()
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    const pedido = data as LinhaDoPedido;
    return typeof pedido?.order_number === "number" ? pedido.order_number : null;
  },

  async emailDoCliente(clienteId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(clienteId);
    if (error) return null;
    return data?.user?.email ?? null;
  },
};

let clienteGuardado: { chave: string; cliente: ClienteSyncPay } | null = null;

/** Monta as dependências reais. O cliente SyncPay só nasce quando é usado. */
export function dependenciasReais(): Dependencias {
  const config = lerConfigDoPix();
  return {
    banco: bancoDoPix,
    config,
    syncpay: () => {
      const chave = `${config.baseUrl}|${config.clientId}`;
      if (!clienteGuardado || clienteGuardado.chave !== chave) {
        clienteGuardado = {
          chave,
          cliente: criarClienteSyncPay({
            baseUrl: config.baseUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
          }),
        };
      }
      return clienteGuardado.cliente;
    },
  };
}

/**
 * Abre o primeiro ciclo de cobrança de uma assinatura recém-ativada.
 *
 * Chamado de todo caminho que pode levar uma assinatura a "active" pela
 * primeira vez: confirmação automática da InfinityPay (webhook), o modo de
 * confiança no retorno do checkout, e o atalho de teste do cadastro. Sem
 * isso, o gatilho que conta pedidos no banco não teria onde lançar o
 * consumo — o cliente nunca seria cobrado por nenhum pedido, mesmo com a
 * conta ativa e recebendo pedidos normalmente.
 *
 * Best-effort: a assinatura já está ativa quando isto roda; uma falha aqui
 * não deve desfazer a ativação. Fica registrada no log para conferência —
 * o mesmo padrão já usado em subscriptionAdmin.functions.ts.
 */

import type { BillingDb } from "./supabaseBridge";
import { POLITICA_CENTS_VIGENTE } from "./centsTiers";

export async function openFirstCycle(db: BillingDb, subscriptionId: string): Promise<void> {
  const { error } = await db.rpc("open_billing_cycle", {
    p_subscription_id: subscriptionId,
    // Carimba a tabela de preços no ciclo. Depois de aberto, ele não muda de
    // preço — nem se a tabela vigente mudar amanhã.
    p_cents_policy: POLITICA_CENTS_VIGENTE.versao,
  });
  if (error) {
    console.error(`[billing] assinatura ${subscriptionId} ativada mas ciclo não abriu:`, error);
  }
}

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { closeBillingCycle } from "@/lib/billing/closeCycle.server";
import { createRecurringCharge } from "@/lib/billing/infinitypay/recurringCharge.server";
import { reconcileOverdueInvoices } from "@/lib/billing/collections.server";
import { recoverInvoiceCharges } from "@/lib/billing/invoiceRecovery.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";

/**
 * O trabalho do fechamento diário, sem a porta HTTP na frente.
 *
 * POR QUE MORA AQUI (e não só dentro do endpoint)
 *
 * O despertador diário (Cloudflare Cron Trigger) rodava dentro do próprio
 * Worker e, para fechar os ciclos, fazia uma chamada pela internet para o
 * próprio endereço do painel. A Cloudflare não entrega uma chamada que um
 * Worker faz para o próprio endereço workers.dev (ou para uma rota da mesma
 * zona): é como o garçom ligar para o telefone do próprio restaurante para
 * fazer um pedido — a linha dá ocupado, e ninguém na cozinha fica sabendo.
 *
 * Agora o despertador chama esta função diretamente, dentro do mesmo Worker,
 * e o endpoint `/api/billing/close-cycles` (para agendador externo e teste
 * manual) chama a mesma função depois de conferir o segredo. Um único caminho
 * de fechamento, sem depender de endereço público nem de rede.
 *
 * Fases, nesta ordem:
 *   1. Fecha todo ciclo vencido e emite a fatura correspondente.
 *   2. Para cada fatura recém-emitida com valor a cobrar, gera o link de
 *      pagamento da InfinityPay (fatura de valor zero é paga sozinha —
 *      nada a cobrar não pode virar motivo de suspensão depois).
 *   3. Rede de segurança (invoiceRecovery.server.ts): recria o link de quem
 *      ficou sem, e reconfere com a InfinityPay os pagamentos cujo aviso
 *      possa ter se perdido — antes de qualquer suspensão.
 *   4. Verifica faturas pendentes vencidas e aplica o prazo de tolerância
 *      (ver collections.ts): sinaliza atraso, e suspende só depois do prazo.
 *
 * Rodar mais de uma vez no mesmo dia não faz mal: cada fase é idempotente.
 */

type OpenCycle = { id: string; company_id: string; cycle_end: string };

export type CloseDueCyclesReport = {
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ cycleId: string; ok: boolean; detail: string }>;
  recovery: Awaited<ReturnType<typeof recoverInvoiceCharges>> | null;
  reconciliation: Awaited<ReturnType<typeof reconcileOverdueInvoices>> | null;
};

export type CloseDueCyclesOutcome =
  | { ok: true; report: CloseDueCyclesReport }
  | { ok: false; error: "query_failed"; message: string };

export async function closeDueCycles(): Promise<CloseDueCyclesOutcome> {
  const db = asBillingDb(supabaseAdmin);
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("billing_cycles")
    .select("id, company_id, cycle_end")
    .eq("status", "open")
    .lte("cycle_end", nowIso);

  if (error) {
    console.error("[billing-cron] falha ao listar ciclos vencidos:", error);
    return { ok: false, error: "query_failed", message: error.message };
  }

  const cycles = (data ?? []) as OpenCycle[];

  // Sequencial de propósito: fechar em paralelo multiplicaria a carga no
  // banco e não traz ganho real — o volume é de dezenas de ciclos por
  // dia, não milhares.
  const results: CloseDueCyclesReport["results"] = [];

  for (const cycle of cycles) {
    try {
      const result = await closeBillingCycle(cycle.id);
      if (result.ok) {
        results.push({
          cycleId: cycle.id,
          ok: true,
          // Período grátis fecha sem fatura de propósito: não se emite
          // conta de R$ 0,00.
          detail: result.freeTrial
            ? `período grátis encerrado${result.alreadyClosed ? " (já estava)" : ""}, ciclo cobrado ${result.nextCycleId ?? "não aberto"}`
            : result.alreadyClosed
              ? `já fechado, fatura ${result.invoiceId}`
              : `fatura ${result.invoiceId}, total ${result.totalAmountCents} centavos`,
        });

        // Só faturas recém-emitidas precisam de cobrança nova — uma já
        // fechada em execução anterior já teve (ou não precisou de)
        // cobrança gerada naquela vez.
        // O ciclo grátis não gera fatura nenhuma — não há o que marcar
        // como paga nem o que cobrar. Sem esta condição, o robô tentaria
        // atualizar uma fatura de identificador nulo.
        if (!result.alreadyClosed && !result.freeTrial && result.invoiceId) {
          if (result.totalAmountCents === 0) {
            // Nada a cobrar: paga sozinha, para não virar motivo de
            // suspensão por atraso de uma dívida que não existe.
            await db
              .from("invoices")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("id", result.invoiceId)
              .eq("status", "pending");
          } else {
            const charge = await createRecurringCharge(result.invoiceId);
            if (!charge.ok) {
              console.error(
                `[billing-cron] fatura ${result.invoiceId} fechada mas sem cobrança gerada: ${charge.reason}`,
              );
            }
          }
        }
      } else {
        results.push({ cycleId: cycle.id, ok: false, detail: result.error });
        console.error(`[billing-cron] ciclo ${cycle.id} não fechou: ${result.error}`);
      }
    } catch (err) {
      // Um ciclo com problema não pode impedir o fechamento dos demais:
      // uma empresa com dado inconsistente travaria a cobrança de todas.
      const message = err instanceof Error ? err.message : String(err);
      results.push({ cycleId: cycle.id, ok: false, detail: message });
      console.error(`[billing-cron] erro inesperado no ciclo ${cycle.id}:`, err);
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  console.log(
    `[billing-cron] ${results.length} ciclo(s) vencido(s): ${succeeded} fechado(s), ${failed} com falha`,
  );

  let recovery: CloseDueCyclesReport["recovery"] = null;
  try {
    recovery = await recoverInvoiceCharges();
    console.log(
      `[billing-cron] rede de segurança: ${recovery.openInvoices} fatura(s) em aberto, ` +
        `${recovery.paymentsConfirmed} pagamento(s) confirmado(s) sem aviso, ` +
        `${recovery.linksCreated} link(s) recriado(s), ${recovery.linksFailed} falha(s)`,
    );
    for (const e of recovery.errors) console.warn(`[billing-cron] ${e}`);
  } catch (err) {
    console.error("[billing-cron] falha na rede de segurança da cobrança:", err);
  }

  let reconciliation: CloseDueCyclesReport["reconciliation"] = null;
  try {
    reconciliation = await reconcileOverdueInvoices();
    console.log(
      `[billing-cron] cobrança: ${reconciliation.checked} fatura(s) vencida(s) revisada(s), ` +
        `${reconciliation.markedPastDue} marcada(s) em atraso, ${reconciliation.suspended} suspensa(s)`,
    );
  } catch (err) {
    console.error("[billing-cron] falha na reconciliação de faturas vencidas:", err);
  }

  return {
    ok: true,
    report: { processed: results.length, succeeded, failed, results, recovery, reconciliation },
  };
}

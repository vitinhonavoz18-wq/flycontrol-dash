import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { closeBillingCycle } from "@/lib/billing/closeCycle.server";
import { createRecurringCharge } from "@/lib/billing/infinitypay/recurringCharge.server";
import { reconcileOverdueInvoices } from "@/lib/billing/collections.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { jsonResponse } from "@/lib/server/http";

/**
 * Fechamento dos ciclos vencidos.
 *
 * Sem este endpoint nenhum ciclo fecha e nenhuma fatura é emitida — o motor
 * de cobrança fica completo mas nunca é acionado. É a peça que faltava para
 * o circuito rodar sozinho.
 *
 * Três fases, nesta ordem:
 *   1. Fecha todo ciclo vencido e emite a fatura correspondente.
 *   2. Para cada fatura recém-emitida com valor a cobrar, gera o link de
 *      pagamento da InfinityPay (fatura de valor zero é paga sozinha —
 *      nada a cobrar não pode virar motivo de suspensão depois).
 *   3. Verifica faturas pendentes vencidas e aplica o prazo de tolerância
 *      (ver collections.ts): sinaliza atraso, e suspende só depois do prazo.
 *
 * Feito para ser chamado por um agendador (Cloudflare Cron Trigger, cron do
 * Supabase, ou qualquer chamador externo) uma vez por dia. Rodar com mais
 * frequência não faz mal: cada fase é idempotente.
 */

/** Segredo do agendador. Sem ele configurado, o endpoint fica desligado. */
const SECRET_HEADER = "x-billing-cron-secret";

const json = (body: unknown, status = 200) => jsonResponse(body, { status });

/**
 * Comparação em tempo constante.
 *
 * Comparar segredo com `===` vaza o tamanho do prefixo correto pelo tempo de
 * resposta. Aqui o custo é o mesmo para qualquer entrada.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type OpenCycle = { id: string; company_id: string; cycle_end: string };

export const Route = createFileRoute("/api/billing/close-cycles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env.BILLING_CRON_SECRET || "").trim();

        // Endpoint desligado por padrão. Um endpoint de cobrança sem segredo
        // configurado seria uma porta aberta para qualquer um disparar
        // faturamento.
        if (!expected) {
          console.error("[billing-cron] BILLING_CRON_SECRET não configurado");
          return json({ error: "not_configured" }, 503);
        }

        const provided = (request.headers.get(SECRET_HEADER) || "").trim();
        if (!provided || !timingSafeEqual(expected, provided)) {
          console.warn("[billing-cron] tentativa com segredo inválido");
          return json({ error: "unauthorized" }, 401);
        }

        const db = asBillingDb(supabaseAdmin);
        const nowIso = new Date().toISOString();

        const { data, error } = await db
          .from("billing_cycles")
          .select("id, company_id, cycle_end")
          .eq("status", "open")
          .lte("cycle_end", nowIso);

        if (error) {
          console.error("[billing-cron] falha ao listar ciclos vencidos:", error);
          return json({ error: "query_failed", message: error.message }, 500);
        }

        const cycles = (data ?? []) as OpenCycle[];

        // Sequencial de propósito: fechar em paralelo multiplicaria a carga no
        // banco e não traz ganho real — o volume é de dezenas de ciclos por
        // dia, não milhares.
        const results: Array<{ cycleId: string; ok: boolean; detail: string }> = [];

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

        let reconciliation: Awaited<ReturnType<typeof reconcileOverdueInvoices>> | null = null;
        try {
          reconciliation = await reconcileOverdueInvoices();
          console.log(
            `[billing-cron] cobrança: ${reconciliation.checked} fatura(s) vencida(s) revisada(s), ` +
              `${reconciliation.markedPastDue} marcada(s) em atraso, ${reconciliation.suspended} suspensa(s)`,
          );
        } catch (err) {
          console.error("[billing-cron] falha na reconciliação de faturas vencidas:", err);
        }

        // 207 quando houve falha parcial: um agendador que só olha o código
        // de status precisa distinguir "tudo certo" de "alguns falharam".
        return json(
          { processed: results.length, succeeded, failed, results, reconciliation },
          failed > 0 ? 207 : 200,
        );
      },
    },
  },
});

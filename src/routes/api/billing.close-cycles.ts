import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { closeBillingCycle } from "@/lib/billing/closeCycle.server";
import { asBillingDb } from "@/lib/billing/supabaseBridge";

/**
 * Fechamento dos ciclos vencidos.
 *
 * Sem este endpoint nenhum ciclo fecha e nenhuma fatura é emitida — o motor
 * de cobrança fica completo mas nunca é acionado. É a peça que faltava para
 * o circuito rodar sozinho.
 *
 * Feito para ser chamado por um agendador (Cloudflare Cron Trigger, cron do
 * Supabase, ou qualquer chamador externo) uma vez por dia. Rodar com mais
 * frequência não faz mal: só fecha ciclo cujo `cycle_end` já passou, e
 * `closeBillingCycle` é idempotente.
 */

/** Segredo do agendador. Sem ele configurado, o endpoint fica desligado. */
const SECRET_HEADER = "x-billing-cron-secret";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
                detail: result.alreadyClosed
                  ? `já fechado, fatura ${result.invoiceId}`
                  : `fatura ${result.invoiceId}, total ${result.totalAmountCents} centavos`,
              });
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

        // 207 quando houve falha parcial: um agendador que só olha o código
        // de status precisa distinguir "tudo certo" de "alguns falharam".
        return json(
          { processed: results.length, succeeded, failed, results },
          failed > 0 ? 207 : 200,
        );
      },
    },
  },
});

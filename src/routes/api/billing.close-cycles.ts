import { createFileRoute } from "@tanstack/react-router";
import { closeDueCycles } from "@/lib/billing/closeDueCycles.server";

/**
 * Fechamento dos ciclos vencidos.
 *
 * Sem este endpoint nenhum ciclo fecha e nenhuma fatura é emitida — o motor
 * de cobrança fica completo mas nunca é acionado. É a peça que faltava para
 * o circuito rodar sozinho.
 *
 * O trabalho em si mora em `src/lib/billing/closeDueCycles.server.ts`. O
 * despertador diário do próprio Worker chama aquela função diretamente; esta
 * porta HTTP serve a agendadores externos e ao teste manual, e só abre com o
 * segredo. Rodar mais de uma vez no mesmo dia não faz mal: cada fase é
 * idempotente.
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

        const outcome = await closeDueCycles();
        if (!outcome.ok) {
          return json({ error: outcome.error, message: outcome.message }, 500);
        }

        // 207 quando houve falha parcial: um agendador que só olha o código
        // de status precisa distinguir "tudo certo" de "alguns falharam".
        return json(outcome.report, outcome.report.failed > 0 ? 207 : 200);
      },
    },
  },
});

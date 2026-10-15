/**
 * Disparo diário do fechamento de ciclos (Cloudflare Cron Trigger, ver
 * wrangler.jsonc).
 *
 * Chama o fechamento DIRETAMENTE, dentro do próprio Worker.
 *
 * Antes, este despertador fazia uma chamada pela internet para o endereço do
 * próprio painel (`FLYCONTROL_PUBLIC_URL/api/billing/close-cycles`). A
 * Cloudflare não entrega uma chamada que o Worker faz para o próprio
 * endereço workers.dev (nem para uma rota da mesma zona) — devolve um erro
 * (código 1042) sem nunca chegar ao endpoint. Foi assim que, em 15/10, o
 * despertador tocou e nenhum ciclo fechou: nenhuma consulta a billing_cycles
 * chegou ao banco naquele horário.
 *
 * É usado pelo plugin do Nitro (`src/nitro/billingCron.plugin.ts`) — quem de
 * fato recebe o despertador da Cloudflare no pacote publicado — e pelo
 * `src/server.ts`.
 */

import type { CloseDueCyclesOutcome } from "./closeDueCycles.server";

export type CronEnv = Record<string, unknown>;

export type DailyCronOutcome =
  | { ran: true; processed: number; succeeded: number; failed: number }
  | { ran: false; reason: "query_failed" | "crashed" };

type CloseFn = () => Promise<CloseDueCyclesOutcome>;

/**
 * Carregado só na hora do disparo: o plugin é iniciado junto com o Worker em
 * toda requisição fria, e não há por que carregar o motor de cobrança inteiro
 * para servir uma página do cardápio.
 */
const loadAndClose: CloseFn = async () => {
  const { closeDueCycles } = await import("./closeDueCycles.server");
  return closeDueCycles();
};

export async function runDailyBillingCron(
  _env: CronEnv = {},
  close: CloseFn = loadAndClose,
): Promise<DailyCronOutcome> {
  console.log("[cron] despertador da cobrança tocou — fechando ciclos vencidos");
  try {
    const outcome = await close();
    if (!outcome.ok) {
      console.error(`[cron] fechamento de ciclos não rodou: ${outcome.error} (${outcome.message})`);
      return { ran: false, reason: "query_failed" };
    }
    const { processed, succeeded, failed } = outcome.report;
    console.log(
      `[cron] fechamento de ciclos concluído: ${processed} vencido(s), ${succeeded} fechado(s), ${failed} com falha`,
    );
    return { ran: true, processed, succeeded, failed };
  } catch (error) {
    // Nunca deixar o erro escapar sem registro: um despertador que falha em
    // silêncio é o mesmo que não ter despertador.
    console.error("[cron] erro inesperado no fechamento de ciclos:", error);
    return { ran: false, reason: "crashed" };
  }
}

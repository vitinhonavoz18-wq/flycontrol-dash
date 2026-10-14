/**
 * Disparo diário do fechamento de ciclos (Cloudflare Cron Trigger, ver
 * wrangler.jsonc).
 *
 * Não repete a lógica de fechamento aqui — chama o próprio endpoint HTTP
 * já protegido pelo segredo, exatamente como qualquer outro agendador
 * externo faria. Um único caminho de fechamento, testado uma vez só.
 *
 * Mora num arquivo próprio porque é usado pelo plugin do Nitro
 * (`src/nitro/billingCron.plugin.ts`) — quem de fato recebe o despertador da
 * Cloudflare no pacote publicado — e pelo `src/server.ts`.
 */

export type CronEnv = Record<string, unknown>;

export type DailyCronOutcome =
  { fired: true; status: number } | { fired: false; reason: "missing_config" | "request_failed" };

function readString(env: CronEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function runDailyBillingCron(
  env: CronEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<DailyCronOutcome> {
  const base = readString(env, "FLYCONTROL_PUBLIC_URL").replace(/\/+$/, "");
  const secret = readString(env, "BILLING_CRON_SECRET");

  if (!base || !secret) {
    console.error(
      "[cron] FLYCONTROL_PUBLIC_URL ou BILLING_CRON_SECRET ausente — fechamento de ciclos não disparado.",
    );
    return { fired: false, reason: "missing_config" };
  }

  try {
    const resp = await fetchImpl(`${base}/api/billing/close-cycles`, {
      method: "POST",
      headers: { "x-billing-cron-secret": secret },
    });
    console.log(`[cron] fechamento de ciclos: status ${resp.status}`);
    return { fired: true, status: resp.status };
  } catch (error) {
    console.error("[cron] falha ao disparar o fechamento de ciclos:", error);
    return { fired: false, reason: "request_failed" };
  }
}

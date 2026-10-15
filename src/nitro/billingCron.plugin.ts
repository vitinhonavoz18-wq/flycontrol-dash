/**
 * O despertador diário da cobrança, do jeito que o pacote publicado escuta.
 *
 * POR QUE ISTO EXISTE
 *
 * O build usa o Nitro (preset cloudflare-module). A porta de entrada do
 * Worker é a do Nitro, e quando a Cloudflare toca o despertador das 08:00 UTC
 * (wrangler.jsonc) o Nitro só avisa quem estiver inscrito no gancho
 * `cloudflare:scheduled`. O `scheduled` de `src/server.ts` nunca era chamado:
 * o despertador tocava todo dia numa cozinha vazia, e nenhum ciclo fechava
 * sozinho.
 *
 * Este plugin é a inscrição que faltava. Ele não decide nada — chama a mesma
 * rotina de fechamento que o endpoint `/api/billing/close-cycles` usa, só que
 * direto, dentro do Worker (ver `runDailyBillingCron`: a chamada pela
 * internet para o próprio endereço era barrada pela Cloudflare).
 */

import { definePlugin } from "nitro";
import { runDailyBillingCron, type CronEnv } from "../lib/billing/dailyCron";

type ScheduledContext = { env?: unknown };
type HookRegistry = {
  hook: (name: "cloudflare:scheduled", fn: (ctx: ScheduledContext) => Promise<void>) => unknown;
};

/** Separado do `definePlugin` para poder ser testado sem o Nitro. */
export function registerBillingCron(
  hooks: HookRegistry,
  run: (env: CronEnv) => Promise<unknown> = runDailyBillingCron,
): void {
  hooks.hook("cloudflare:scheduled", async ({ env }) => {
    await run((env ?? {}) as CronEnv);
  });
}

export default definePlugin((nitroApp) => {
  registerBillingCron(nitroApp.hooks as unknown as HookRegistry);
});

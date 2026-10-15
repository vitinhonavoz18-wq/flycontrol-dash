import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runDailyBillingCron } from "./dailyCron";
import { registerBillingCron } from "../../nitro/billingCron.plugin";
import type { CloseDueCyclesOutcome } from "./closeDueCycles.server";

const report = (failed = 0): CloseDueCyclesOutcome => ({
  ok: true,
  report: {
    processed: 1 + failed,
    succeeded: 1,
    failed,
    results: [],
    recovery: null,
    reconciliation: null,
  },
});

describe("runDailyBillingCron", () => {
  it("fecha os ciclos chamando a rotina diretamente, sem depender de endereço nem segredo", async () => {
    // O despertador antigo ligava para o endereço público do próprio painel;
    // a Cloudflare não entrega essa ligação. Agora não há ligação nenhuma.
    const close = vi.fn(async () => report());
    const out = await runDailyBillingCron({}, close);
    expect(close).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ran: true, processed: 1, succeeded: 1, failed: 0 });
  });

  it("relata falha parcial", async () => {
    const out = await runDailyBillingCron({}, async () => report(2));
    expect(out).toEqual({ ran: true, processed: 3, succeeded: 1, failed: 2 });
  });

  it("relata quando a consulta dos ciclos falha", async () => {
    const out = await runDailyBillingCron({}, async () => ({
      ok: false,
      error: "query_failed",
      message: "boom",
    }));
    expect(out).toEqual({ ran: false, reason: "query_failed" });
  });

  it("um erro inesperado não escapa sem registro", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await runDailyBillingCron({}, async () => {
      throw new Error("offline");
    });
    expect(out).toEqual({ ran: false, reason: "crashed" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("não faz chamada HTTP para o próprio painel", () => {
    // Trava a regressão: fetch do Worker para o próprio domínio é bloqueado
    // pela Cloudflare (erro 1042) e o fechamento nunca chega a rodar.
    const source = readFileSync("src/lib/billing/dailyCron.ts", "utf8");
    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/process\.env\.FLYCONTROL_PUBLIC_URL|"FLYCONTROL_PUBLIC_URL"/);
  });
});

describe("plugin do Nitro", () => {
  it("se inscreve no gancho cloudflare:scheduled e repassa o env do Worker", async () => {
    const handlers = new Map<string, (ctx: { env?: unknown }) => Promise<void>>();
    const run = vi.fn(async () => undefined);
    registerBillingCron({ hook: (name, fn) => handlers.set(name, fn) }, run);

    expect([...handlers.keys()]).toEqual(["cloudflare:scheduled"]);
    const env = { BILLING_CRON_SECRET: "s" };
    await handlers.get("cloudflare:scheduled")!({ env });
    expect(run).toHaveBeenCalledWith(env);
  });
});

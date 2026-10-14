import { describe, expect, it, vi } from "vitest";
import { runDailyBillingCron } from "./dailyCron";
import { registerBillingCron } from "../../nitro/billingCron.plugin";

const okFetch = () =>
  vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & {
    mock: { calls: unknown[][] };
  };

describe("runDailyBillingCron", () => {
  it("chama o fechamento com o segredo no cabeçalho", async () => {
    const fetchImpl = okFetch();
    const out = await runDailyBillingCron(
      { FLYCONTROL_PUBLIC_URL: "https://painel.exemplo.com/", BILLING_CRON_SECRET: " s3gredo " },
      fetchImpl,
    );
    expect(out).toEqual({ fired: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledWith("https://painel.exemplo.com/api/billing/close-cycles", {
      method: "POST",
      headers: { "x-billing-cron-secret": "s3gredo" },
    });
  });

  it("não chama nada sem segredo", async () => {
    const fetchImpl = okFetch();
    const out = await runDailyBillingCron({ FLYCONTROL_PUBLIC_URL: "https://x" }, fetchImpl);
    expect(out).toEqual({ fired: false, reason: "missing_config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("não chama nada sem endereço público", async () => {
    const fetchImpl = okFetch();
    const out = await runDailyBillingCron({ BILLING_CRON_SECRET: "s" }, fetchImpl);
    expect(out).toEqual({ fired: false, reason: "missing_config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falha de rede não derruba o despertador", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await runDailyBillingCron(
      { FLYCONTROL_PUBLIC_URL: "https://x", BILLING_CRON_SECRET: "s" },
      fetchImpl,
    );
    expect(out).toEqual({ fired: false, reason: "request_failed" });
  });
});

describe("plugin do Nitro", () => {
  it("se inscreve no gancho cloudflare:scheduled e repassa o env do Worker", async () => {
    const handlers = new Map<string, (ctx: { env?: unknown }) => Promise<void>>();
    const run = vi.fn(async () => undefined);
    registerBillingCron({ hook: (name, fn) => handlers.set(name, fn) }, run);

    expect([...handlers.keys()]).toEqual(["cloudflare:scheduled"]);
    const env = { BILLING_CRON_SECRET: "s", FLYCONTROL_PUBLIC_URL: "https://x" };
    await handlers.get("cloudflare:scheduled")!({ env });
    expect(run).toHaveBeenCalledWith(env);
  });
});

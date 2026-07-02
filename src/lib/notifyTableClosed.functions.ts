import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WEBHOOK_URL = "https://conectfly.com.br/api/public/flycontrol-table-closed";

const Input = z.object({
  request_id: z.string().nullable().optional(),
  table_number: z.string().nullable().optional(),
  session_id: z.string(),
  dining_session_id: z.string().nullable().optional(),
  customer_token: z.string().nullable().optional(),
  restaurant_id: z.string().nullable().optional(),
  closed_at: z.string(),
});

export const notifyTableClosed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const ctx = {
      request_id: data.request_id ?? null,
      table_number: data.table_number ?? null,
      session_id: data.session_id,
      dining_session_id: data.dining_session_id ?? null,
      customer_token: data.customer_token ?? null,
      restaurant_id: data.restaurant_id ?? null,
    };
    console.log("TABLE_CLOSED_WEBHOOK_START", ctx);

    const payload = {
      event: "TABLE_SESSION_CLOSED",
      restaurant_id: data.restaurant_id,
      table_number: data.table_number,
      request_id: data.request_id,
      session_id: data.session_id,
      dining_session_id: data.dining_session_id ?? null,
      customer_token: data.customer_token ?? null,
      closed_at: data.closed_at,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const bodyText = await res.text().catch(() => "");
      const result = { ok: res.ok, status: res.status, body: bodyText.slice(0, 500) };
      if (res.ok) console.log("TABLE_CLOSED_WEBHOOK_SUCCESS", { ...ctx, ...result });
      else console.error("TABLE_CLOSED_WEBHOOK_FAILED", { ...ctx, ...result });
      return result;
    } catch (err: any) {
      const errInfo = {
        ok: false,
        status: 0,
        error: err?.name === "AbortError" ? "timeout" : (err?.message || String(err)),
      };
      console.error("TABLE_CLOSED_WEBHOOK_FAILED", { ...ctx, ...errInfo });
      return errInfo;
    } finally {
      clearTimeout(timeout);
    }
  });

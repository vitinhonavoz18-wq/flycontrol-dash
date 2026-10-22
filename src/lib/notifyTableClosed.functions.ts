import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SIGNATURE_HEADER, signWebhookBody } from "@/lib/webhookSignature";

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

/**
 * QUEM PODE MANDAR O AVISO DE "MESA FECHADA"
 *
 * Este aviso sai ASSINADO com o segredo que o SiteCreatorFly confere. Antes,
 * qualquer pessoa na internet podia chamar esta função, sem login, dizendo
 * "a mesa X da loja Y fechou" — e o FlyControl assinava e entregava. A
 * assinatura existe justamente para o SiteCreatorFly confiar no aviso; um
 * carimbo que carimba qualquer papel que chega no balcão não prova nada.
 *
 * Agora:
 *   1. só passa quem está logado no painel;
 *   2. a comanda é buscada com os olhos de quem pediu — dono da loja ou
 *      administrador. Comanda de outra loja simplesmente "não existe";
 *   3. ela precisa estar mesmo fechada no banco;
 *   4. loja, mesa, senha da comanda e horário vêm do BANCO, não do navegador.
 *      O que o navegador manda é só "qual comanda".
 */
export const notifyTableClosed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: sess, error: sessErr } = await context.supabase
      .from("table_sessions")
      .select(
        "id, restaurant_id, table_number, status, closed_at, dining_session_id, customer_token",
      )
      .eq("id", data.session_id)
      .maybeSingle();

    if (sessErr || !sess) {
      return { ok: false, status: 404, error: "session_not_found" };
    }
    if (!["closed", "archived"].includes(String(sess.status))) {
      return { ok: false, status: 409, error: "session_not_closed" };
    }

    // O pedido de fechamento só entra no aviso se for desta mesma comanda.
    let requestId: string | null = null;
    if (data.request_id) {
      const { data: req } = await context.supabase
        .from("table_close_requests")
        .select("id")
        .eq("id", data.request_id)
        .eq("session_id", sess.id)
        .maybeSingle();
      requestId = req?.id ?? null;
    }

    const ctx = {
      request_id: requestId,
      table_number: sess.table_number ?? null,
      session_id: sess.id,
      dining_session_id: sess.dining_session_id ?? null,
      // Só o começo da senha vai para o registro, o bastante para cruzar logs.
      customer_token: sess.customer_token ? String(sess.customer_token).slice(0, 6) + "…" : null,
      restaurant_id: sess.restaurant_id ?? null,
    };
    console.log("TABLE_CLOSED_WEBHOOK_START", ctx);

    const payload = {
      event: "TABLE_SESSION_CLOSED",
      restaurant_id: sess.restaurant_id,
      table_number: sess.table_number,
      request_id: requestId,
      session_id: sess.id,
      dining_session_id: sess.dining_session_id ?? null,
      customer_token: sess.customer_token ?? null,
      closed_at: sess.closed_at ?? data.closed_at,
    };

    // Assina o corpo EXATO que vai na requisição: reserializar mudaria os
    // bytes e o SiteCreatorFly recusaria o HMAC.
    const rawBody = JSON.stringify(payload);
    const signature = await signWebhookBody(rawBody);
    if (!signature) {
      console.warn("TABLE_CLOSED_WEBHOOK_UNSIGNED", {
        ...ctx,
        reason: "FL_WEBHOOK_SECRET not configured",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
        },
        body: rawBody,
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

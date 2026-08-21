import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

export const notifyTableClosed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Este aviso sai daqui ASSINADO com o segredo do FlyControl, e o
    // SiteCreatorFly confia nele justamente por causa da assinatura. Antes,
    // qualquer pessoa podia pedir esse aviso para qualquer mesa de qualquer
    // loja: era como um estranho conseguir usar o carimbo oficial do
    // restaurante para mandar recado em nome dele. Agora só sai aviso de
    // comanda que pertence a quem está pedindo.
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, restaurant_id")
      .eq("id", data.session_id)
      .maybeSingle();

    if (!session) throw new Error("Comanda não encontrada.");

    const { data: pizzeria } = await supabaseAdmin
      .from("pizzerias")
      .select("id, owner_id")
      .eq("id", (session as { restaurant_id: string }).restaurant_id)
      .maybeSingle();

    if (!pizzeria || (pizzeria as { owner_id: string | null }).owner_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("is_admin");
      if (!isAdmin) throw new Error("Esta comanda não pertence à sua loja.");
    }

    // O identificador da loja usado no aviso é o do banco, não o que veio no
    // pedido: quem manda a mensagem não escolhe em nome de quem ela vai.
    const restaurantId = (session as { restaurant_id: string }).restaurant_id;

    const ctx = {
      request_id: data.request_id ?? null,
      table_number: data.table_number ?? null,
      session_id: data.session_id,
      dining_session_id: data.dining_session_id ?? null,
      customer_token: data.customer_token ?? null,
      restaurant_id: restaurantId,
    };
    console.log("TABLE_CLOSED_WEBHOOK_START", ctx);

    const payload = {
      event: "TABLE_SESSION_CLOSED",
      restaurant_id: restaurantId,
      table_number: data.table_number,
      request_id: data.request_id,
      session_id: data.session_id,
      dining_session_id: data.dining_session_id ?? null,
      customer_token: data.customer_token ?? null,
      closed_at: data.closed_at,
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
        error: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
      };
      console.error("TABLE_CLOSED_WEBHOOK_FAILED", { ...ctx, ...errInfo });
      return errInfo;
    } finally {
      clearTimeout(timeout);
    }
  });

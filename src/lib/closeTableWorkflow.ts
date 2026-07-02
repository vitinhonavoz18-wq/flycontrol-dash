import { supabase } from "@/integrations/supabase/client";


export type CloseTableInput = {
  sessionId: string;
  /** Optional — when provided, avoids an extra DB lookup */
  tableNumber?: string;
  restaurantId?: string;
  /** Optional — close request id when the closure was triggered from a popup */
  requestId?: string;
};

export type CloseTableResult = {
  success: boolean;
  sessionClosed: boolean;
  requestUpdated: boolean;
  webhookOk: boolean;
  closedAt: string;
  tableNumber: string | null;
  restaurantId: string | null;
  requestId: string | null;
  error?: string;
};

/**
 * Single source of truth for closing a table.
 * Every UI closure path (popup, TablesManagement, print comanda, manual, admin)
 * MUST call this function.
 *
 * Steps:
 *  1. Close the table_sessions row.
 *  2. Locate and update the related table_close_requests row -> 'completed'.
 *  3. POST to SiteCreatorFly webhook (flycontrol-table-closed).
 *  4. Return a structured result.
 */
export async function closeTableWorkflow(
  input: CloseTableInput
): Promise<CloseTableResult> {
  const closedAt = new Date().toISOString();
  const { data: u } = await supabase.auth.getUser();
  const operatorId = u?.user?.id || null;
  const operatorName =
    (u?.user?.user_metadata as any)?.full_name || u?.user?.email || "operador";

  const result: CloseTableResult = {
    success: false,
    sessionClosed: false,
    requestUpdated: false,
    webhookOk: false,
    closedAt,
    tableNumber: input.tableNumber ?? null,
    restaurantId: input.restaurantId ?? null,
    requestId: input.requestId ?? null,
  };

  // Load session identity (needed for the webhook payload)
  let diningSessionId: string | null = null;
  let customerToken: string | null = null;
  {
    const { data: sess } = await supabase
      .from("table_sessions")
      .select("table_number, restaurant_id, tenant_id, dining_session_id, customer_token")
      .eq("id", input.sessionId)
      .maybeSingle();
    if (sess) {
      result.tableNumber = result.tableNumber ?? (sess as any).table_number ?? null;
      result.restaurantId =
        result.restaurantId ??
        (sess as any).restaurant_id ??
        (sess as any).tenant_id ??
        null;
      diningSessionId = (sess as any).dining_session_id ?? null;
      customerToken = (sess as any).customer_token ?? null;
    }
  }

  // STEP 1 — Close table_sessions (DB is the authority).
  // Any live status (open/requested_close/waiting_operator/closing) may transition to closed.
  // Once closed, the state machine trigger blocks any further mutation.
  const { data: closedRow, error: closeErr } = await supabase
    .from("table_sessions")
    .update({
      status: "closed",
      closed_at: closedAt,
      closed_by: operatorId,
      closure_reason: "operator_close",
    } as any)
    .eq("id", input.sessionId)
    .in("status", ["open", "requested_close", "waiting_operator", "closing"])
    .select("id, table_number, restaurant_id, closed_at, webhook_sent_at, dining_session_id, customer_token")
    .maybeSingle();

  if (closeErr) {
    result.error = closeErr.message;
    return result;
  }

  if (!closedRow) {
    // Session was already closed/archived (or doesn't exist). Do not re-fire the webhook.
    result.error = "session_already_closed";
    return result;
  }

  result.sessionClosed = true;
  result.tableNumber = result.tableNumber ?? (closedRow as any).table_number ?? null;
  result.restaurantId = result.restaurantId ?? (closedRow as any).restaurant_id ?? null;
  diningSessionId = diningSessionId ?? (closedRow as any).dining_session_id ?? null;
  customerToken = customerToken ?? (closedRow as any).customer_token ?? null;

  // STEP 2 — Find + update related close request
  let requestId = input.requestId ?? null;
  if (!requestId) {
    const { data: req } = await supabase
      .from("table_close_requests")
      .select("id")
      .eq("session_id", input.sessionId)
      .in("status", ["pending", "viewed", "printed"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    requestId = (req as any)?.id ?? null;
  }

  if (requestId) {
    const { error: updErr } = await supabase
      .from("table_close_requests")
      .update({
        status: "completed",
        processed_at: closedAt,
        processed_by: operatorId,
      })
      .eq("id", requestId);
    if (!updErr) {
      result.requestUpdated = true;
      result.requestId = requestId;
    } else {
      console.warn("[closeTableWorkflow] failed to update close request:", updErr);
    }
  }

  // STEP 3 — Atomically claim the webhook slot. Only ONE caller can flip
  // webhook_sent_at from NULL to a timestamp; everyone else gets 0 rows back
  // and skips the network call. Guarantees exactly-once delivery per session.
  const { data: claimed } = await supabase
    .from("table_sessions")
    .update({ webhook_sent_at: closedAt } as any)
    .eq("id", input.sessionId)
    .is("webhook_sent_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    console.log("[closeTableWorkflow] webhook already sent for session", input.sessionId);
    result.webhookOk = true; // previously delivered
  } else {
    try {
      const { notifyTableClosed } = await import("@/lib/notifyTableClosed.functions");
      const whRes = await notifyTableClosed({
        data: {
          restaurant_id: result.restaurantId,
          table_number: result.tableNumber,
          request_id: result.requestId,
          session_id: input.sessionId,
          dining_session_id: diningSessionId,
          customer_token: customerToken,
          closed_at: closedAt,
        },
      });
      result.webhookOk = !!whRes?.ok;
      console.log("[closeTableWorkflow] webhook result", whRes);
      // If the webhook failed, release the slot so a retry can re-attempt.
      if (!result.webhookOk) {
        await supabase
          .from("table_sessions")
          .update({ webhook_sent_at: null } as any)
          .eq("id", input.sessionId);
      }
    } catch (whErr) {
      console.warn("[closeTableWorkflow] webhook call failed (continuing):", whErr);
      await supabase
        .from("table_sessions")
        .update({ webhook_sent_at: null } as any)
        .eq("id", input.sessionId);
    }
  }


  console.log("TABLE_CLOSED", {
    session_id: input.sessionId,
    table_number: result.tableNumber,
    restaurant_id: result.restaurantId,
    request_id: result.requestId,
    closed_at: closedAt,
    operator: operatorName,
    request_updated: result.requestUpdated,
    webhook_ok: result.webhookOk,
  });

  result.success = true;
  return result;
}

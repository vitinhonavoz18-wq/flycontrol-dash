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

  // Backfill missing session metadata
  if (!input.tableNumber || !input.restaurantId) {
    const { data: sess } = await supabase
      .from("table_sessions")
      .select("table_number, restaurant_id, tenant_id")
      .eq("id", input.sessionId)
      .maybeSingle();
    if (sess) {
      result.tableNumber = result.tableNumber ?? (sess as any).table_number ?? null;
      result.restaurantId =
        result.restaurantId ??
        (sess as any).restaurant_id ??
        (sess as any).tenant_id ??
        null;
    }
  }

  // STEP 1 — Close table_sessions
  const { error: closeErr } = await supabase
    .from("table_sessions")
    .update({
      status: "closed",
      closed_at: closedAt,
      closed_by: operatorId,
      closure_reason: "operator_close",
    } as any)
    .eq("id", input.sessionId);

  if (closeErr) {
    result.error = closeErr.message;
    return result;
  }
  result.sessionClosed = true;

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

  // STEP 3 — Notify SiteCreatorFly via server-side endpoint (must not be sent from the browser)
  try {
    const { notifyTableClosed } = await import("@/lib/notifyTableClosed.functions");
    const whRes = await notifyTableClosed({
      data: {
        restaurant_id: result.restaurantId,
        table_number: result.tableNumber,
        request_id: result.requestId,
        session_id: input.sessionId,
        closed_at: closedAt,
      },
    });
    result.webhookOk = !!whRes?.ok;
    console.log("[closeTableWorkflow] webhook result", whRes);
  } catch (whErr) {
    console.warn("[closeTableWorkflow] webhook call failed (continuing):", whErr);
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

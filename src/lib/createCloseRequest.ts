import { supabase } from "@/integrations/supabase/client";

/**
 * UNIFIED close-request creator.
 *
 * Every close origin — customer POST, waiter portal, operator/manager Tables
 * screen, dashboard, popup — MUST go through this function so that:
 *   1) An INSERT into `table_close_requests` (status=pending) ALWAYS happens.
 *   2) The realtime pipeline (owner popup + waiter notifications) fires the
 *      same event regardless of origin.
 *   3) The session transitions to `requested_close` if still `open`.
 *
 * If a pending request already exists for the session, it is reused (idempotent).
 * Returns the request row id.
 */
export type EnsureCloseRequestInput = {
  sessionId: string;
  origin: "customer" | "waiter" | "operator" | "dashboard" | "internal";
  customerName?: string | null;
};

export type EnsureCloseRequestResult = {
  requestId: string;
  status: "created" | "already_pending";
  sessionStatus: string;
};

export async function ensureCloseRequest(
  input: EnsureCloseRequestInput,
): Promise<EnsureCloseRequestResult> {
  const { sessionId, origin, customerName } = input;

  // Load session identity so we can copy dining_session_id / customer_token
  // onto the request row (authoritative contract).
  const { data: sess, error: sErr } = await supabase
    .from("table_sessions")
    .select(
      "id, status, restaurant_id, table_id, table_number, customer_name, dining_session_id, customer_token",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!sess) throw new Error("session_not_found");
  if (["closed", "archived"].includes((sess as any).status)) {
    throw new Error("session_closed");
  }

  // Dedup: reuse the latest pending/viewed request for this session.
  const { data: existing } = await supabase
    .from("table_close_requests")
    .select("id")
    .eq("session_id", sessionId)
    .in("status", ["pending", "viewed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Ensure session status is at least requested_close so the state machine
  // reflects the pending action for all origins.
  if ((sess as any).status === "open") {
    await supabase
      .from("table_sessions")
      .update({ status: "requested_close" } as any)
      .eq("id", sessionId)
      .eq("status", "open");
  }

  if (existing) {
    console.log("[ensureCloseRequest] reuse pending", (existing as any).id, "origin=", origin);
    return {
      requestId: (existing as any).id,
      status: "already_pending",
      sessionStatus: "requested_close",
    };
  }

  const { data: inserted, error: iErr } = await supabase
    .from("table_close_requests")
    .insert({
      restaurant_id: (sess as any).restaurant_id,
      table_id: (sess as any).table_id,
      table_number: (sess as any).table_number,
      session_id: sessionId,
      dining_session_id: (sess as any).dining_session_id,
      customer_token: (sess as any).customer_token,
      customer_name: customerName ?? (sess as any).customer_name ?? null,
      status: "pending",
    } as any)
    .select("id")
    .single();
  if (iErr) throw new Error(iErr.message);

  console.log("[ensureCloseRequest] created", (inserted as any).id, "origin=", origin, "session=", sessionId);
  return {
    requestId: (inserted as any).id,
    status: "created",
    sessionStatus: "requested_close",
  };
}

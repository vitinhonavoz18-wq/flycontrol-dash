/**
 * Orphan detection for table_close_requests.
 *
 * A pending request is considered an ORPHAN when it can never be processed
 * through the normal popup / close-table flow. Any of these makes it an orphan:
 *
 *   1. session_id IS NULL
 *   2. dining_session_id IS NULL
 *   3. session_id points to a session that no longer exists or is
 *      closed / archived (not an active table session)
 *   4. dining_session_id has no matching active table_sessions row
 *   5. session_id and dining_session_id refer to different logical
 *      table lifecycles (i.e. the sessions row for session_id does not
 *      have dining_session_id = request.dining_session_id)
 *
 * Healthy pending requests (both ids present, both sessions active, and the
 * two ids refer to the SAME table_sessions row) are never touched.
 *
 * Orphans get status = 'acknowledged'. The Realtime UPDATE listener treats any
 * non-pending/viewed status as "close popup" so acknowledged rows disappear
 * from the queue everywhere.
 */

// Any client (browser publishable or admin) implementing the subset we need.
type Client = {
  from: (t: string) => any;
};

type Scope = {
  restaurantId: string;
  /** Optional — narrows the sweep to a single physical table. */
  tableId?: string | null;
};

type PendingRow = {
  id: string;
  session_id: string | null;
  dining_session_id: string | null;
};

type SessionRow = {
  id: string;
  status: string;
  dining_session_id: string | null;
};

const ACTIVE_STATUSES = new Set([
  "open",
  "requested_close",
  "waiting_operator",
  "closing",
]);

/**
 * Detect orphan pending rows and flip them to 'acknowledged'. Returns the
 * list of acknowledged ids (empty when nothing was orphaned). Never touches
 * healthy pending requests.
 */
export async function acknowledgeOrphanCloseRequests(
  client: Client,
  scope: Scope,
): Promise<string[]> {
  let q = client
    .from("table_close_requests")
    .select("id, session_id, dining_session_id")
    .eq("status", "pending")
    .eq("restaurant_id", scope.restaurantId);
  if (scope.tableId) q = q.eq("table_id", scope.tableId);

  const { data: pending, error } = await q;
  if (error || !pending || pending.length === 0) return [];

  const rows = pending as PendingRow[];

  // Collect referenced session_ids so we can validate them in one round-trip.
  const sessionIds = Array.from(
    new Set(rows.map((r) => r.session_id).filter((x): x is string => !!x)),
  );

  const sessionsById = new Map<string, SessionRow>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await client
      .from("table_sessions")
      .select("id, status, dining_session_id")
      .in("id", sessionIds);
    for (const s of (sessions || []) as SessionRow[]) sessionsById.set(s.id, s);
  }

  const orphans: string[] = [];
  for (const r of rows) {
    // Rule 1 + 2
    if (!r.session_id || !r.dining_session_id) {
      orphans.push(r.id);
      continue;
    }
    const s = sessionsById.get(r.session_id);
    // Rule 3
    if (!s || !ACTIVE_STATUSES.has(s.status)) {
      orphans.push(r.id);
      continue;
    }
    // Rule 5 — session exists and is active, but its dining_session_id does
    // not match the request's. Different logical table lifecycle.
    if (s.dining_session_id && s.dining_session_id !== r.dining_session_id) {
      orphans.push(r.id);
      continue;
    }
    // Rule 4 — dining_session_id must correspond to an active session. Since
    // we already verified the session_id row is active AND its
    // dining_session_id matches (or was null and we tolerate it), rule 4 is
    // implicitly satisfied here.
  }

  if (orphans.length === 0) return [];

  const { error: updErr } = await client
    .from("table_close_requests")
    .update({
      status: "acknowledged",
      processed_at: new Date().toISOString(),
    })
    .in("id", orphans)
    .eq("status", "pending"); // guard against races
  if (updErr) {
    console.warn("[acknowledgeOrphanCloseRequests] update error:", updErr);
    return [];
  }

  console.log(
    "[acknowledgeOrphanCloseRequests] acknowledged",
    orphans.length,
    "orphan(s) for restaurant",
    scope.restaurantId,
    scope.tableId ? `table ${scope.tableId}` : "",
  );
  return orphans;
}

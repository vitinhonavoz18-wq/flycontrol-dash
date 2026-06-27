import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Password hashing (PBKDF2 via WebCrypto — Cloudflare Worker safe)
// ============================================================
const PBKDF2_ITER = 100_000;
const KEY_LEN = 32;

function toB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password) as unknown as BufferSource, "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key, KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITER}$${toB64(salt)}$${toB64(hash)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iter = Number(iterStr);
    const salt = fromB64(saltB64);
    const expected = fromB64(hashB64);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(password) as unknown as BufferSource, "PBKDF2", false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: iter, hash: "SHA-256" },
      key, expected.length * 8,
    );
    const got = new Uint8Array(bits);
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

// ============================================================
// Opaque session token (HMAC-signed) for waiter portal
// ============================================================
async function getHmacKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "fly-waiter-fallback";
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function signToken(waiterId: string, tenantId: string, expiresAt: number) {
  const payload = `${waiterId}.${tenantId}.${expiresAt}`;
  const key = await getHmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(payload) as unknown as BufferSource,
  ));
  return `${payload}.${toB64(sig)}`;
}

export async function verifyWaiterToken(token: string): Promise<{ waiterId: string; tenantId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [waiterId, tenantId, expStr, sigB64] = parts;
  const exp = Number(expStr);
  if (!exp || Date.now() > exp) return null;
  const payload = `${waiterId}.${tenantId}.${expStr}`;
  const key = await getHmacKey();
  const ok = await crypto.subtle.verify(
    "HMAC", key,
    fromB64(sigB64) as unknown as BufferSource,
    new TextEncoder().encode(payload) as unknown as BufferSource,
  );
  return ok ? { waiterId, tenantId } : null;
}

// ============================================================
// Tenant ownership helper (used by admin-only fns)
// ============================================================
async function assertOwnsTenant(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("pizzerias")
    .select("id, owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Loja não encontrada");
  // super admin check via has_role
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (data.owner_id !== userId && !isAdmin) throw new Error("Acesso negado a esta loja");
}

// ============================================================
// Admin: list / create / update / toggle / reset
// ============================================================
export const listWaiters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("waiters")
      .select("id, full_name, phone, username, is_active, last_login_at, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createWaiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    tenantId: string; fullName: string; phone?: string;
    username: string; password: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertOwnsTenant(context.supabase, context.userId, data.tenantId);
    if (!data.fullName.trim()) throw new Error("Nome obrigatório");
    if (!data.username.trim()) throw new Error("Usuário obrigatório");
    if (data.password.length < 4) throw new Error("Senha deve ter no mínimo 4 caracteres");

    const username = data.username.trim().toLowerCase();
    const password_hash = await hashPassword(data.password);

    const { data: row, error } = await context.supabase
      .from("waiters")
      .insert({
        tenant_id: data.tenantId,
        full_name: data.fullName.trim(),
        phone: data.phone?.trim() || null,
        username,
        password_hash,
        is_active: true,
      })
      .select("id, full_name, phone, username, is_active, last_login_at, created_at")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new Error("Já existe um garçom com este usuário nesta loja");
      throw new Error(error.message);
    }
    return row;
  });

export const updateWaiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    waiterId: string;
    fullName?: string; phone?: string; isActive?: boolean; newPassword?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    // Confirm ownership via row
    const { data: existing, error: eErr } = await context.supabase
      .from("waiters").select("id, tenant_id").eq("id", data.waiterId).maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!existing) throw new Error("Garçom não encontrado");
    await assertOwnsTenant(context.supabase, context.userId, existing.tenant_id);

    const patch: any = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName.trim();
    if (data.phone !== undefined) patch.phone = data.phone.trim() || null;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.newPassword) {
      if (data.newPassword.length < 4) throw new Error("Senha deve ter no mínimo 4 caracteres");
      patch.password_hash = await hashPassword(data.newPassword);
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase.from("waiters").update(patch).eq("id", data.waiterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWaiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { waiterId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("waiters").select("id, tenant_id").eq("id", data.waiterId).maybeSingle();
    if (!existing) return { ok: true };
    await assertOwnsTenant(context.supabase, context.userId, existing.tenant_id);
    const { error } = await context.supabase.from("waiters").delete().eq("id", data.waiterId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Public: waiter login + actions in their portal
// ============================================================
export const waiterLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim().toLowerCase();
    if (!username || !data.password) throw new Error("Informe usuário e senha");

    // username is unique per-tenant; allow login by listing matches and trying each
    const { data: rows, error } = await supabaseAdmin
      .from("waiters")
      .select("id, tenant_id, full_name, password_hash, is_active")
      .eq("username", username);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) throw new Error("Usuário ou senha inválidos");

    for (const row of rows) {
      if (!row.is_active) continue;
      if (await verifyPassword(data.password, row.password_hash)) {
        await supabaseAdmin.from("waiters").update({ last_login_at: new Date().toISOString() }).eq("id", row.id);
        const expiresAt = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
        const token = await signToken(row.id, row.tenant_id, expiresAt);
        return {
          token, expiresAt,
          waiter: { id: row.id, fullName: row.full_name, tenantId: row.tenant_id },
        };
      }
    }
    throw new Error("Usuário ou senha inválidos");
  });

// Claim/assign waiter to an open table session (stamps responsibility)
export const claimTableSession = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; sessionId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await verifyWaiterToken(data.token);
    if (!auth) throw new Error("Sessão de garçom expirada");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sess, error: sErr } = await supabaseAdmin
      .from("table_sessions")
      .select("id, restaurant_id, status, waiter_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sess) throw new Error("Comanda não encontrada");
    if (sess.restaurant_id !== auth.tenantId) throw new Error("Comanda não pertence à sua loja");
    if (sess.status !== "open") throw new Error("Comanda já está fechada");
    const { error: uErr } = await supabaseAdmin
      .from("table_sessions").update({ waiter_id: auth.waiterId }).eq("id", data.sessionId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

// ============================================================
// Waiter portal data fetchers + actions (token-authenticated)
// ============================================================

async function authed(token: string) {
  const auth = await verifyWaiterToken(token);
  if (!auth) throw new Error("Sessão de garçom expirada");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { auth, supabaseAdmin };
}

// List open sessions for the waiter's tenant (with current responsible)
export const listMyTenantSessions = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("table_sessions")
      .select("id, table_number, table_name, status, total_amount, subtotal_amount, service_fee_amount, service_fee_enabled, opened_at, closed_at, waiter_id, waiters(full_name)")
      .eq("restaurant_id", auth.tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows || []).map((r: any) => ({ ...r, waiter: r.waiters }));
  });

// List tables that are active and have no open session (available to open)
export const listAvailableTables = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: tables, error } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, table_name, public_token, is_active")
      .eq("restaurant_id", auth.tenantId)
      .eq("is_active", true)
      .order("table_number");
    if (error) throw new Error(error.message);
    const { data: openSess } = await supabaseAdmin
      .from("table_sessions")
      .select("table_number")
      .eq("restaurant_id", auth.tenantId)
      .eq("status", "open");
    const taken = new Set((openSess || []).map((s: any) => String(s.table_number)));
    return (tables || []).filter((t: any) => !taken.has(String(t.table_number)));
  });

// Open a new table session and assign current waiter
export const openTableAsWaiter = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; tableId: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: t, error: tErr } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, restaurant_id, table_number, table_name, is_active")
      .eq("id", data.tableId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!t || t.restaurant_id !== auth.tenantId) throw new Error("Mesa não encontrada");
    if (!t.is_active) throw new Error("Mesa inativa");

    const { data: existing } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("restaurant_id", auth.tenantId)
      .eq("table_number", String(t.table_number))
      .eq("status", "open")
      .maybeSingle();
    if (existing) throw new Error("Já existe uma comanda aberta para esta mesa");

    const { data: ins, error: iErr } = await supabaseAdmin
      .from("table_sessions")
      .insert({
        restaurant_id: auth.tenantId,
        table_id: t.id,
        table_number: String(t.table_number),
        table_name: t.table_name || `Mesa ${t.table_number}`,
        status: "open",
        subtotal_amount: 0,
        total_amount: 0,
        service_fee_enabled: false,
        service_fee_percent: 15,
        service_fee_amount: 0,
        waiter_id: auth.waiterId,
        opened_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { ok: true, sessionId: ins.id };
  });

// List orders linked to a session (waiter must own session's tenant)
export const listSessionOrders = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; sessionId: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: sess } = await supabaseAdmin
      .from("table_sessions").select("restaurant_id").eq("id", data.sessionId).maybeSingle();
    if (!sess || sess.restaurant_id !== auth.tenantId) throw new Error("Comanda não encontrada");
    const { data, error } = await supabaseAdmin
      .from("table_session_orders")
      .select("order_id, orders(id, order_number, customer_name, total, status, items, notes, created_at)")
      .eq("table_session_id", data.sessionId);
    if (error) throw new Error(error.message);
    return (data || []).map((d: any) => d.orders).filter(Boolean);
  });

// Request close for a session (waiter-driven)
export const waiterRequestClose = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; sessionId: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: sess } = await supabaseAdmin
      .from("table_sessions")
      .select("id, restaurant_id, table_number, table_id, customer_name, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!sess || sess.restaurant_id !== auth.tenantId) throw new Error("Comanda não encontrada");
    if (sess.status !== "open") throw new Error("Comanda já está fechada");

    const { data: existing } = await supabaseAdmin
      .from("table_close_requests")
      .select("id")
      .eq("session_id", sess.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { ok: true, requestId: existing.id, status: "already_pending" };

    const { data: ins, error } = await supabaseAdmin
      .from("table_close_requests")
      .insert({
        restaurant_id: sess.restaurant_id,
        table_id: sess.table_id,
        table_number: sess.table_number,
        session_id: sess.id,
        customer_name: sess.customer_name,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, requestId: ins.id, status: "created" };
  });

// List pending close requests for waiter's tenant
export const listMyCloseRequests = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("table_close_requests")
      .select("id, table_number, status, requested_at, customer_name, session_id")
      .eq("restaurant_id", auth.tenantId)
      .in("status", ["pending", "viewed"])
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows || [];
  });

// Waiter commissions: 15% service fee on closed sessions assigned to this waiter
export const listMyCommissions = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; fromIso?: string; toIso?: string }) => d)
  .handler(async ({ data }) => {
    const { auth, supabaseAdmin } = await authed(data.token);
    let q = supabaseAdmin
      .from("table_sessions")
      .select("id, table_number, opened_at, closed_at, status, subtotal_amount, service_fee_amount, service_fee_enabled, total_amount")
      .eq("restaurant_id", auth.tenantId)
      .eq("waiter_id", auth.waiterId)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (data.fromIso) q = q.gte("opened_at", data.fromIso);
    if (data.toIso) q = q.lte("opened_at", data.toIso);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const sessions = rows || [];
    const closed = sessions.filter((s: any) => s.status === "closed");
    const totalSubtotal = closed.reduce((a: number, s: any) => a + Number(s.subtotal_amount || 0), 0);
    const totalCommission = closed.reduce((a: number, s: any) => a + Number(s.service_fee_amount || 0), 0);
    return {
      sessions,
      summary: {
        closedCount: closed.length,
        openCount: sessions.length - closed.length,
        totalSubtotal,
        totalCommission,
      },
    };
  });

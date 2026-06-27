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
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
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
      "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
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
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function signToken(waiterId: string, tenantId: string, expiresAt: number) {
  const payload = `${waiterId}.${tenantId}.${expiresAt}`;
  const key = await getHmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
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
  const ok = await crypto.subtle.verify("HMAC", key, fromB64(sigB64), new TextEncoder().encode(payload));
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

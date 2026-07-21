import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsTenantWithFeature } from "@/lib/server/plan-guard";

async function assertOwns(supabase: any, userId: string, tenantId: string) {
  await assertOwnsTenantWithFeature(supabase, userId, tenantId, "commissions");
}

// Read current commission percentage
export const getCommissionPercent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwns(context.supabase, context.userId, data.tenantId);
    const { data: row, error } = await context.supabase
      .from("pizzerias").select("waiter_commission_percent").eq("id", data.tenantId).single();
    if (error) throw new Error(error.message);
    return { percent: Number(row?.waiter_commission_percent ?? 10) };
  });

// Update commission percentage
export const setCommissionPercent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; percent: number }) => d)
  .handler(async ({ data, context }) => {
    await assertOwns(context.supabase, context.userId, data.tenantId);
    if (!(data.percent >= 0 && data.percent <= 100)) throw new Error("Percentual inválido (0–100)");
    const { error } = await context.supabase
      .from("pizzerias")
      .update({ waiter_commission_percent: data.percent })
      .eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Commission report: aggregates closed sessions in [from, to]
// Reporting-only — does NOT touch revenue / accounting.
export const getCommissionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; fromIso: string; toIso: string; waiterId?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwns(context.supabase, context.userId, data.tenantId);

    let q = context.supabase
      .from("table_sessions")
      .select("id, table_number, opened_at, closed_at, status, subtotal_amount, waiter_commission_percent, waiter_commission_amount, waiter_id, waiters(full_name)")
      .eq("restaurant_id", data.tenantId)
      .eq("status", "closed")
      .gte("closed_at", data.fromIso)
      .lte("closed_at", data.toIso)
      .order("closed_at", { ascending: false })
      .limit(2000);
    if (data.waiterId) q = q.eq("waiter_id", data.waiterId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const sessions = (rows || []).map((r: any) => ({
      id: r.id,
      tableNumber: r.table_number,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      subtotal: Number(r.subtotal_amount || 0),
      commissionPercent: Number(r.waiter_commission_percent || 0),
      commissionAmount: Number(r.waiter_commission_amount || 0),
      waiterId: r.waiter_id,
      waiterName: r.waiters?.full_name || null,
    }));

    // Per-waiter breakdown
    const byWaiter = new Map<string, {
      waiterId: string | null; waiterName: string;
      tables: number; totalSales: number; commission: number;
    }>();
    for (const s of sessions) {
      const key = s.waiterId || "__none__";
      const cur = byWaiter.get(key) || {
        waiterId: s.waiterId, waiterName: s.waiterName || "Sem garçom",
        tables: 0, totalSales: 0, commission: 0,
      };
      cur.tables += 1;
      cur.totalSales += s.subtotal;
      cur.commission += s.commissionAmount;
      byWaiter.set(key, cur);
    }
    const perWaiter = [...byWaiter.values()].map((w) => ({
      ...w, avgTicket: w.tables ? w.totalSales / w.tables : 0,
    })).sort((a, b) => b.commission - a.commission);

    const totalSales = sessions.reduce((a, s) => a + s.subtotal, 0);
    const totalCommission = sessions.reduce((a, s) => a + s.commissionAmount, 0);
    const tablesCount = sessions.length;

    return {
      summary: {
        totalSales,
        totalCommission,
        tablesCount,
        avgTicket: tablesCount ? totalSales / tablesCount : 0,
      },
      perWaiter,
      sessions,
    };
  });

// List waiters of a tenant for the filter dropdown
export const listTenantWaiters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertOwns(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("waiters").select("id, full_name").eq("tenant_id", data.tenantId).order("full_name");
    if (error) throw new Error(error.message);
    return rows || [];
  });

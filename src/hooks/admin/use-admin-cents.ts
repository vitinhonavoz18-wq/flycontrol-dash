import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-0000000000c1";

export function useAdminCentsOverview() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-cents-overview"],
    queryFn: async () => {
      const [{ data: statuses, error: e1 }, { data: activeCycles, error: e2 }, { data: settings, error: e3 }] = await Promise.all([
        supabase
          .from("club_customer_status")
          .select("company_id, current_streak, goal_reached, legend, hall_of_fame, lifetime_orders, gold_cycles_total, current_level(name, slug, icon, color), pizzerias:company_id(name, slug, plan_type)")
          .eq("club_id", DEFAULT_CLUB_ID),
        supabase
          .from("club_cycles")
          .select("company_id, orders, goal, goal_reached, ends_at, price_per_order")
          .eq("club_id", DEFAULT_CLUB_ID)
          .eq("status", "ativo"),
        supabase.from("club_settings").select("*").eq("club_id", DEFAULT_CLUB_ID).maybeSingle(),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;

      const cyclesByCompany = new Map((activeCycles ?? []).map((c) => [c.company_id, c]));

      // Só exibe empresas atualmente no plano CENTS. Trocar para Premium remove
      // a empresa desta lista sem apagar club_customer_status/club_history —
      // ela reaparece automaticamente se voltar para CENTS.
      const centsStatuses = (statuses ?? []).filter((s: any) => s.pizzerias?.plan_type === "cents");

      const rows = centsStatuses.map((s: any) => ({
        companyId: s.company_id,
        companyName: s.pizzerias?.name ?? "—",
        companySlug: s.pizzerias?.slug ?? "",
        level: s.current_level,
        streak: s.current_streak,
        goalReached: s.goal_reached,
        legend: s.legend,
        hallOfFame: s.hall_of_fame,
        lifetimeOrders: s.lifetime_orders,
        goldCyclesTotal: s.gold_cycles_total,
        cycle: cyclesByCompany.get(s.company_id) ?? null,
      }));

      const kpis = {
        totalCompanies: rows.length,
        bronze: rows.filter((r) => r.level?.slug === "bronze").length,
        prata: rows.filter((r) => r.level?.slug === "prata").length,
        ouro: rows.filter((r) => r.level?.slug === "ouro").length,
        legend: rows.filter((r) => r.legend).length,
        goalReachedNow: rows.filter((r) => r.goalReached).length,
        maxStreak: rows.reduce((max, r) => Math.max(max, r.streak), 0),
      };

      return { rows, kpis, settings };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-cents-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "club_customer_status" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-cents-overview"] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "club_cycles" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-cents-overview"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useClubCentsAuditLog() {
  return useQuery({
    queryKey: ["admin-cents-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_audit_logs")
        .select("id, action, table_name, old_value, new_value, created_at, user_id")
        .in("table_name", ["club_settings", "club_levels"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function updateClubSettings(patch: {
  default_price_per_order: number;
  gold_price_per_order: number;
  goal_orders: number;
  challenge_days: number;
  voucher_months: number;
  legend_streak_required: number;
}) {
  const { error } = await supabase
    .from("club_settings")
    .update(patch)
    .eq("club_id", DEFAULT_CLUB_ID);
  if (error) throw error;
}

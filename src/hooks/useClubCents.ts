import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ClubCentsData = {
  level: { name: string; slug: string; icon: string | null; color: string | null } | null;
  streak: number;
  legend: boolean;
  hallOfFame: boolean;
  goalReached: boolean;
  currentPrice: number | null;
  nextCyclePrice: number | null;
  cycle: {
    orders: number;
    goal: number;
    startedAt: string;
    endsAt: string;
    pricePerOrder: number;
    estimatedAmount: number | null;
  } | null;
  challengeActive: boolean;
};

const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-0000000000c1";

export function useClubCents(tenantId: string | null) {
  const [data, setData] = useState<ClubCentsData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const [{ data: status }, { data: cycle }] = await Promise.all([
      supabase
        .from("club_customer_status")
        .select("current_streak, legend, hall_of_fame, goal_reached, current_price, next_cycle_price, current_level(name, slug, icon, color)")
        .eq("company_id", tenantId)
        .eq("club_id", DEFAULT_CLUB_ID)
        .maybeSingle(),
      supabase
        .from("club_cycles")
        .select("orders, goal, started_at, ends_at, price_per_order, estimated_amount, id")
        .eq("company_id", tenantId)
        .eq("club_id", DEFAULT_CLUB_ID)
        .eq("status", "ativo")
        .maybeSingle(),
    ]);

    let challengeActive = false;
    if (cycle?.id) {
      const { data: challenge } = await supabase.rpc("club_is_challenge_active", { p_cycle_id: cycle.id });
      challengeActive = !!challenge;
    }

    setData({
      level: (status?.current_level as any) ?? null,
      streak: status?.current_streak ?? 0,
      legend: status?.legend ?? false,
      hallOfFame: status?.hall_of_fame ?? false,
      goalReached: status?.goal_reached ?? false,
      currentPrice: status?.current_price ?? null,
      nextCyclePrice: status?.next_cycle_price ?? null,
      cycle: cycle
        ? {
            orders: cycle.orders,
            goal: cycle.goal,
            startedAt: cycle.started_at,
            endsAt: cycle.ends_at,
            pricePerOrder: cycle.price_per_order,
            estimatedAmount: cycle.estimated_amount,
          }
        : null,
      challengeActive,
    });
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { planHasFeature, type Feature, type PlanType, normalizePlanType } from "@/lib/planPermissions";

interface PlanCtx {
  companyId: string | null;
  planType: PlanType;
  loading: boolean;
  hasFeature: (feature: Feature) => boolean;
}

const Ctx = createContext<PlanCtx | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [planType, setPlanType] = useState<PlanType>("premium");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || isSuperAdmin) {
      // Admin não é dono de empresa nenhuma: navega com acesso total.
      setCompanyId(null);
      setPlanType("premium");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadCompanyPlan() {
      const params = new URLSearchParams(window.location.search);
      const pizzeriaId = params.get("pizzeriaId");

      let query = supabase.from("pizzerias").select("id, plan_type");
      query = pizzeriaId
        ? query.eq("id", pizzeriaId)
        : query.eq("owner_id", user!.id).neq("status", "deleted").order("created_at").limit(1);

      const { data, error } = await query.maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setCompanyId(data.id);
        setPlanType(normalizePlanType(data.plan_type));
      }
      setLoading(false);
    }

    void loadCompanyPlan();
    return () => { cancelled = true; };
  }, [user, isSuperAdmin, authLoading]);

  // Reage a alterações de plano feitas pelo admin em tempo real — sem logout,
  // sem novo login, sem precisar recarregar a página.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`plan-changes-${companyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pizzerias", filter: `id=eq.${companyId}` },
        (payload) => {
          const next = (payload.new as { plan_type?: string })?.plan_type;
          if (next) setPlanType(normalizePlanType(next));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  return (
    <Ctx.Provider
      value={{
        companyId,
        planType,
        loading,
        hasFeature: (feature) => isSuperAdmin || planHasFeature(planType, feature),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePlan() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlan must be used within PlanProvider");
  return c;
}

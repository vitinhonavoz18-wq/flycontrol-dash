import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  planHasFeature,
  type Feature,
  type PlanType,
  normalizePlanType,
} from "@/lib/planPermissions";
import { addonDaFeature, ehAddonValido, type Addon } from "@/lib/addons";

interface PlanCtx {
  companyId: string | null;
  planType: PlanType;
  loading: boolean;
  /**
   * "Esta aba aparece para esta loja?" — pergunta do PLANO.
   *
   * Responde SIM para o Chat de um premium que ainda não contratou: a aba
   * aparece justamente para ele ver que existe e poder contratar. Quem
   * responde se ela FUNCIONA é `hasAddon`.
   */
  hasFeature: (feature: Feature) => boolean;
  /** "Esta loja contratou este recurso extra?" — pergunta da CONTRATAÇÃO. */
  hasAddon: (addon: Addon) => boolean;
  /** Plano E contratação, as duas coisas juntas. */
  featureLiberada: (feature: Feature) => boolean;
  addons: Addon[];
}

const Ctx = createContext<PlanCtx | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [planType, setPlanType] = useState<PlanType>("premium");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || isSuperAdmin) {
      // Admin não é dono de empresa nenhuma: navega com acesso total.
      setCompanyId(null);
      setPlanType("premium");
      setAddons([]);
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
        : query
            .eq("owner_id", user!.id)
            .neq("status", "deleted")
            .neq("status", "inactive")
            .order("created_at")
            .limit(1);

      const { data, error } = await query.maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setCompanyId(data.id);
        setPlanType(normalizePlanType(data.plan_type));
        await carregarAddons(data.id);
        if (cancelled) return;
      }
      setLoading(false);
    }

    // As contratações extras da loja (hoje só o Chat).
    //
    // Se a consulta falhar, a lista fica VAZIA — ou seja, o recurso conta como
    // não contratado. É o mesmo cuidado do resto do sistema: falha de rede
    // tranca a porta, nunca escancara. O pior que acontece é o lojista ver a
    // tela de "fale com o suporte" por alguns segundos; o contrário seria
    // entregar o CRM para quem não pagou.
    async function carregarAddons(tenantId: string) {
      // O arquivo de tipos do banco é gerado automaticamente e ainda não
      // conhece a tabela nova — é a planta da casa desenhada antes do
      // puxadinho. Depois de aplicar a migração e regerar os tipos, este
      // atalho sai. Mesma situação já documentada em `lib/marketing/db.ts`.
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from("company_addons")
        .select("addon")
        .eq("tenant_id", tenantId)
        .eq("status", "active");

      if (cancelled) return;
      if (error || !data) {
        setAddons([]);
        return;
      }
      setAddons(
        (data as Array<{ addon: string }>).map((l) => l.addon).filter(ehAddonValido) as Addon[],
      );
    }

    void loadCompanyPlan();
    return () => {
      cancelled = true;
    };
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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // O mesmo para a contratação do Chat: quando o suporte liga o recurso, a
  // aba passa a funcionar na tela do lojista na hora — sem sair e entrar de
  // novo, sem pedir para ele atualizar a página. Ele está no telefone com
  // você quando isso acontece; fazer o cliente deslogar no meio da ligação é
  // péssimo.
  useEffect(() => {
    if (!companyId) return;
    const canal = supabase
      .channel(`addon-changes-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_addons",
          filter: `tenant_id=eq.${companyId}`,
        },
        () => {
          void (async () => {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const { data } = await (supabase as any)
              .from("company_addons")
              .select("addon")
              .eq("tenant_id", companyId)
              .eq("status", "active");
            setAddons(
              ((data ?? []) as Array<{ addon: string }>)
                .map((l) => l.addon)
                .filter(ehAddonValido) as Addon[],
            );
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [companyId]);

  return (
    <Ctx.Provider
      value={{
        companyId,
        planType,
        loading,
        addons,
        hasFeature: (feature) => isSuperAdmin || planHasFeature(planType, feature),
        hasAddon: (addon) => isSuperAdmin || addons.includes(addon),
        featureLiberada: (feature) => {
          if (isSuperAdmin) return true;
          if (!planHasFeature(planType, feature)) return false;
          const addon = addonDaFeature(feature);
          // Feature sem contratação separada: o plano já basta.
          return addon === null || addons.includes(addon);
        },
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

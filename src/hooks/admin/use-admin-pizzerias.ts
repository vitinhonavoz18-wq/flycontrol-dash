import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useAdminPizzerias() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-pizzerias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pizzeria_financial_metrics").select("*");
      if (error) throw error;
      const rows = data ?? [];

      // A view de métricas não traz plano nem nome do dono — busca os dois
      // à parte, para os modais de descadastro/exclusão poderem mostrar
      // quem é o dono da loja sem inventar uma segunda fonte de verdade.
      const pizzeriaIds = rows.map((r) => r.pizzeria_id).filter((id): id is string => !!id);
      const ownerIds = Array.from(
        new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id)),
      );

      const [{ data: extra }, { data: profiles }] = await Promise.all([
        pizzeriaIds.length
          ? supabase.from("pizzerias").select("id, plan_type").in("id", pizzeriaIds)
          : Promise.resolve({ data: [] as { id: string; plan_type: string | null }[] }),
        ownerIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", ownerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      ]);

      const planById = new Map((extra ?? []).map((e) => [e.id, e.plan_type]));
      const nameByOwner = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      return rows.map((r) => ({
        ...r,
        plan_type: r.pizzeria_id ? (planById.get(r.pizzeria_id) ?? null) : null,
        owner_name: r.owner_id ? (nameByOwner.get(r.owner_id) ?? null) : null,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("pizzerias-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pizzerias" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-pizzerias"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

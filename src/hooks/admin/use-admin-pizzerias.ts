import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useAdminPizzerias() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-pizzerias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pizzeria_financial_metrics")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("pizzerias-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pizzerias" },
        () => queryClient.invalidateQueries({ queryKey: ["admin-pizzerias"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

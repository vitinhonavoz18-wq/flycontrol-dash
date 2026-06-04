import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAdminGlobalMetrics() {
  return useQuery({
    queryKey: ["admin-global-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_admin_global_metrics");
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

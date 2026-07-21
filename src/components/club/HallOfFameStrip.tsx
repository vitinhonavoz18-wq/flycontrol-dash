import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type HallOfFameRow = {
  company_name: string;
  company_slug: string;
  level_name: string | null;
  level_icon: string | null;
  level_color: string | null;
  streak: number;
  legend: boolean;
  lifetime_orders: number;
};

export function HallOfFameStrip() {
  const [rows, setRows] = useState<HallOfFameRow[]>([]);

  useEffect(() => {
    supabase.rpc("club_get_hall_of_fame", { p_limit: 6 }).then(({ data }) => {
      if (data) setRows(data as HallOfFameRow[]);
    });
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">👑 Hall da Fama do Clube CENTS</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {rows.map((r) => (
          <div key={r.company_slug} className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/30">
            <span className="font-medium text-sm">{r.company_name}</span>
            {r.legend && (
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30" variant="outline">👑 LENDA</Badge>
            )}
            {r.level_name && (
              <Badge variant="outline" style={{ borderColor: r.level_color ?? undefined, color: r.level_color ?? undefined }}>
                {r.level_icon} {r.level_name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">🔥 {r.streak}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

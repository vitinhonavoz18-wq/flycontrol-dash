import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClubCents } from "@/hooks/useClubCents";

function daysLeft(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ClubCentsCard({ tenantId }: { tenantId: string | null }) {
  const { data, loading } = useClubCents(tenantId);

  if (loading || !data || !data.cycle) return null;

  const { cycle, level, streak, legend, goalReached, nextCyclePrice } = data;
  const pct = cycle.goal > 0 ? Math.min(100, Math.round((cycle.orders / cycle.goal) * 100)) : 0;
  const remaining = Math.max(0, cycle.goal - cycle.orders);

  // Estados da barra: cinza (início) -> azul (intermediário) -> laranja (perto) -> verde (conquistado)
  const barColor = goalReached
    ? "bg-green-500"
    : remaining <= 100
    ? "bg-orange-500"
    : pct >= 40
    ? "bg-blue-500"
    : "bg-muted-foreground/40";

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-card to-primary/5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">🏆 Clube CENTS</span>
            {level && (
              <Badge variant="outline" style={{ borderColor: level.color ?? undefined, color: level.color ?? undefined }}>
                {level.icon} {level.name}
              </Badge>
            )}
            {legend && (
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30" variant="outline">
                👑 LENDA CENTS
              </Badge>
            )}
          </div>
          {streak > 0 && (
            <span className="text-sm text-muted-foreground">
              {"🔥".repeat(Math.min(streak, 5))} {streak} {streak === 1 ? "ciclo consecutivo" : "ciclos consecutivos"}
            </span>
          )}
        </div>

        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {cycle.orders} / {cycle.goal} pedidos ({pct}%)
          </span>
          <span className="text-muted-foreground">{daysLeft(cycle.endsAt)} dias restantes no ciclo</span>
        </div>

        <p className="mt-2 text-sm font-medium">
          {goalReached ? (
            <>Benefício Ouro garantido para o próximo ciclo{nextCyclePrice != null ? ` (R$ ${nextCyclePrice.toFixed(2)} por pedido)` : ""}.</>
          ) : (
            <>
              Faltam apenas <strong>{remaining}</strong> pedidos para conquistar o 🥇 Benefício Ouro do Clube CENTS.
            </>
          )}
        </p>

        {data.challengeActive && (
          <div className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-600">
            🚀 Desafio dos 7 Dias — você está muito perto. Vamos conquistar o Benefício Ouro!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

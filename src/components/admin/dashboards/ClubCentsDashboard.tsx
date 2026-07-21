import { useState } from "react";
import { useAdminCentsOverview, updateClubSettings, useClubCentsAuditLog } from "@/hooks/admin/use-admin-cents";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Trophy, Flame, Crown, Target } from "lucide-react";

function Kpi({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const FIELD_LABELS: Record<string, string> = {
  default_price_per_order: "Preço padrão",
  gold_price_per_order: "Preço Ouro",
  goal_orders: "Meta de pedidos",
  challenge_days: "Dias do desafio",
  voucher_months: "Meses do voucher",
  legend_streak_required: "Ciclos p/ LENDA",
  name: "Nome do nível",
  min_orders: "Pedidos mínimos",
};

function describeAuditChange(entry: { table_name: string; old_value: any; new_value: any }) {
  const changed = Object.keys(entry.new_value ?? {}).filter(
    (key) => key !== "updated_at" && entry.old_value?.[key] !== entry.new_value?.[key]
  );
  if (changed.length === 0) return "Nenhum campo alterado";
  return changed
    .map((key) => `${FIELD_LABELS[key] ?? key}: ${entry.old_value?.[key] ?? "—"} → ${entry.new_value?.[key] ?? "—"}`)
    .join(", ");
}

export const ClubCentsDashboard = () => {
  const { data, isLoading, error } = useAdminCentsOverview();
  const { data: auditLog } = useClubCentsAuditLog();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  const settings = form ?? (data?.settings
    ? {
        default_price_per_order: String(data.settings.default_price_per_order),
        gold_price_per_order: String(data.settings.gold_price_per_order),
        goal_orders: String(data.settings.goal_orders),
        challenge_days: String(data.settings.challenge_days),
        voucher_months: String(data.settings.voucher_months),
        legend_streak_required: String(data.settings.legend_streak_required),
      }
    : null);

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="p-8 text-destructive">Erro ao carregar Clube CENTS.</div>;
  if (!data) return null;

  const filteredRows = data.rows.filter((r) =>
    r.companyName.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await updateClubSettings({
        default_price_per_order: Number(settings.default_price_per_order),
        gold_price_per_order: Number(settings.gold_price_per_order),
        goal_orders: Number(settings.goal_orders),
        challenge_days: Number(settings.challenge_days),
        voucher_months: Number(settings.voucher_months),
        legend_streak_required: Number(settings.legend_streak_required),
      });
      toast.success("Configurações do Clube CENTS salvas.");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">🏆 Clube CENTS</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Empresas no clube" value={data.kpis.totalCompanies} icon={Trophy} />
        <Kpi label="Empresas Ouro" value={data.kpis.ouro} icon={Target} />
        <Kpi label="LENDA CENTS" value={data.kpis.legend} icon={Crown} />
        <Kpi label="Maior sequência" value={data.kpis.maxStreak} icon={Flame} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Configurações do Clube</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {settings && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Preço padrão / pedido (R$)</label>
                <Input value={settings.default_price_per_order} onChange={(e) => setForm({ ...settings, default_price_per_order: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Preço Benefício Ouro / pedido (R$)</label>
                <Input value={settings.gold_price_per_order} onChange={(e) => setForm({ ...settings, gold_price_per_order: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Meta de pedidos por ciclo</label>
                <Input value={settings.goal_orders} onChange={(e) => setForm({ ...settings, goal_orders: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Dias do Desafio dos 7 Dias</label>
                <Input value={settings.challenge_days} onChange={(e) => setForm({ ...settings, challenge_days: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Meses do Voucher de Fidelidade</label>
                <Input value={settings.voucher_months} onChange={(e) => setForm({ ...settings, voucher_months: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ciclos consecutivos p/ LENDA CENTS</label>
                <Input value={settings.legend_streak_required} onChange={(e) => setForm({ ...settings, legend_streak_required: e.target.value })} />
              </div>
              <div className="col-span-full">
                <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {auditLog && auditLog.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Últimas alterações administrativas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {auditLog.map((entry) => (
              <div key={entry.id} className="text-xs border-b border-border last:border-0 pb-2 last:pb-0">
                <span className="text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("pt-BR")} —{" "}
                  {entry.table_name === "club_settings" ? "Configurações do clube" : "Nível do clube"}:
                </span>{" "}
                {describeAuditChange(entry)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Empresas no Clube</h2>
        <Input placeholder="Buscar por nome..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Ciclo atual</TableHead>
              <TableHead>Sequência</TableHead>
              <TableHead>Pedidos totais</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((r) => (
              <TableRow key={r.companyId}>
                <TableCell>
                  <div className="font-semibold text-foreground">{r.companyName}</div>
                  <div className="text-xs text-muted-foreground">{r.companySlug}</div>
                </TableCell>
                <TableCell>
                  {r.level && (
                    <Badge variant="outline" style={{ borderColor: r.level.color, color: r.level.color }}>
                      {r.level.icon} {r.level.name}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {r.cycle ? `${r.cycle.orders} / ${r.cycle.goal} pedidos` : "—"}
                </TableCell>
                <TableCell>{r.streak > 0 ? `🔥 ${r.streak}` : "—"}</TableCell>
                <TableCell>{r.lifetimeOrders}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {r.legend && <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30" variant="outline">👑 LENDA</Badge>}
                    {r.goalReached && <Badge className="bg-green-500/10 text-green-600 border-green-500/30" variant="outline">Ouro conquistado</Badge>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

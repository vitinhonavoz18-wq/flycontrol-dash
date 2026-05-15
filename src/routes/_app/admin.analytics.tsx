import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/admin/analytics")({ component: Analytics });

function Analytics() {
  const { isSuperAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<{ total: number; revenue: number; pizzerias: number; byDay: any[] }>({
    total: 0, revenue: 0, pizzerias: 0, byDay: [],
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => { if (mounted && !loading && !isSuperAdmin) nav({ to: "/dashboard" }); }, [loading, isSuperAdmin, nav, mounted]);

  useEffect(() => { if (mounted && isSuperAdmin) load(); }, [isSuperAdmin, mounted]);
  async function load() {
    const since = new Date(); since.setDate(since.getDate() - 14);
    const [{ data: orders }, { count: pCount }] = await Promise.all([
      supabase.from("orders").select("created_at,total").neq("status", "deleted").gte("created_at", since.toISOString()),
      supabase.from("pizzerias").select("*", { count: "exact", head: true }).neq("status", "deleted"),
    ]);
    const byDayMap = new Map<string, { day: string; pedidos: number; receita: number }>();
    (orders ?? []).forEach((o: any) => {
      const d = new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const cur = byDayMap.get(d) ?? { day: d, pedidos: 0, receita: 0 };
      cur.pedidos += 1; cur.receita += Number(o.total);
      byDayMap.set(d, cur);
    });
    setStats({
      total: orders?.length ?? 0,
      revenue: (orders ?? []).reduce((s: number, o: any) => s + Number(o.total), 0),
      pizzerias: pCount ?? 0,
      byDay: Array.from(byDayMap.values()),
    });
  }

  if (!mounted || loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!isSuperAdmin) return null;
  return (
    <div className="p-6 md:p-8">
      <h1 className="mb-6 text-3xl font-bold">Analytics (14 dias)</h1>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat label="Pizzarias" value={stats.pizzerias} />
        <Stat label="Pedidos" value={stats.total} />
        <Stat label="Receita" value={`R$ ${stats.revenue.toFixed(2)}`} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Pedidos por dia</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={stats.byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
              <Bar dataKey="pedidos" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold text-primary">{value}</div>
    </div>
  );
}

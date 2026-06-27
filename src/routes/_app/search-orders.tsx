import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, RotateCcw, Loader2 } from "lucide-react";
import { formatItemName, getItemPrice, normalizeOrderType } from "@/utils/order-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/search-orders")({ component: SearchOrdersPage });

type OrderRow = {
  id: string;
  order_number: number;
  tenant_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  neighborhood: string | null;
  items: any;
  total: number | null;
  delivery_fee: number | null;
  payment_method: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  order_type: string | null;
  service_mode: string | null;
  table_number: string | null;
  table_name: string | null;
  payment_status: string | null;
};

const STATUS_OPTIONS = [
  "pendente", "preparando", "pronto", "saiu_entrega", "entregue", "concluido", "cancelado",
];
const PAYMENT_OPTIONS = ["dinheiro", "pix", "cartao", "credito", "debito", "online"];
const TYPE_OPTIONS = [
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Retirada" },
  { value: "table", label: "Mesa" },
];

function fmtMoney(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("pt-BR");
}

function SearchOrdersPage() {
  const { user, isSuperAdmin } = useAuth();
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<OrderRow | null>(null);

  const [filters, setFilters] = useState({
    customer: "",
    phone: "",
    orderNumber: "",
    startDate: "",
    endDate: "",
    status: "all",
    payment: "all",
    type: "all",
  });

  useEffect(() => {
    async function loadTenants() {
      if (!user) return;
      let q = supabase.from("pizzerias").select("id");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      setTenantIds((data || []).map((p: any) => p.id));
    }
    loadTenants();
  }, [user, isSuperAdmin]);

  async function runSearch() {
    if (!tenantIds.length) {
      toast.error("Nenhuma loja encontrada");
      return;
    }
    setLoading(true);
    try {
      let q = supabase
        .from("orders")
        .select("*")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters.customer.trim()) q = q.ilike("customer_name", `%${filters.customer.trim()}%`);
      if (filters.phone.trim()) q = q.ilike("customer_phone", `%${filters.phone.trim()}%`);
      if (filters.orderNumber.trim()) {
        const n = Number(filters.orderNumber.trim());
        if (!isNaN(n)) q = q.eq("order_number", n);
      }
      if (filters.startDate) q = q.gte("created_at", new Date(filters.startDate).toISOString());
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.payment !== "all") q = q.eq("payment_method", filters.payment);

      const { data, error } = await q;
      if (error) throw error;

      let result = (data || []) as OrderRow[];
      if (filters.type !== "all") {
        result = result.filter((o) => normalizeOrderType(o) === filters.type);
      }
      setRows(result);
    } catch (e: any) {
      toast.error(e.message || "Erro ao buscar pedidos");
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setFilters({
      customer: "", phone: "", orderNumber: "", startDate: "", endDate: "",
      status: "all", payment: "all", type: "all",
    });
    setRows([]);
  }

  const items = useMemo(() => {
    if (!selected) return [];
    const raw = selected.items;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  }, [selected]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Search className="h-7 w-7 text-primary" />
          Buscar Pedidos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pesquise pedidos por cliente, telefone, número, data, status, pagamento ou tipo.
        </p>
      </div>

      <Card className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Nome do Cliente</Label>
            <Input value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} placeholder="Ex: João" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-1.5">
            <Label>Nº do Pedido</Label>
            <Input value={filters.orderNumber} onChange={(e) => setFilters({ ...filters, orderNumber: e.target.value })} placeholder="123" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data Inicial</Label>
            <Input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Data Final</Label>
            <Input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de Pagamento</Label>
            <Select value={filters.payment} onValueChange={(v) => setFilters({ ...filters, payment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PAYMENT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo do Pedido</Label>
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={runSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Buscar
          </Button>
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4 mr-2" /> Limpar
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">Resultados</div>
          <Badge variant="secondary">{rows.length} pedido(s)</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? "Buscando..." : "Nenhum pedido. Ajuste os filtros e clique em Buscar."}
                  </TableCell>
                </TableRow>
              ) : rows.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                  <TableCell className="font-mono">#{o.order_number}</TableCell>
                  <TableCell>{o.customer_name || "—"}</TableCell>
                  <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                  <TableCell>{fmtMoney(o.total)}</TableCell>
                  <TableCell>{o.payment_method || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{o.status || "—"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Pedido #{selected.order_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <Section title="Cliente">
                  <Row label="Nome" value={selected.customer_name} />
                  <Row label="Telefone" value={selected.customer_phone} />
                  <Row label="Endereço" value={selected.customer_address} />
                  {selected.neighborhood && <Row label="Bairro" value={selected.neighborhood} />}
                </Section>

                <Section title="Pedido">
                  <Row label="Data/Hora" value={fmtDateTime(selected.created_at)} />
                  <Row label="Tipo" value={normalizeOrderType(selected)} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Pagamento" value={selected.payment_method} />
                  {selected.payment_status && <Row label="Status Pagamento" value={selected.payment_status} />}
                  {(selected.table_number || selected.table_name) && (
                    <Row label="Mesa" value={selected.table_name || selected.table_number} />
                  )}
                </Section>

                <Section title="Itens">
                  {items.length === 0 ? (
                    <div className="text-muted-foreground">Sem itens.</div>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((it: any, i: number) => (
                        <li key={i} className="flex justify-between border-b pb-2 last:border-0">
                          <div>
                            <div className="font-medium">{(it.quantity || it.qty || 1)}x {formatItemName(it)}</div>
                            {(it.notes || it.observations || it.observacao) && (
                              <div className="text-xs text-muted-foreground">Obs: {it.notes || it.observations || it.observacao}</div>
                            )}
                          </div>
                          <div className="font-mono">{fmtMoney(Number(getItemPrice(it)))}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {selected.notes && (
                  <Section title="Observações">
                    <div className="whitespace-pre-wrap">{selected.notes}</div>
                  </Section>
                )}

                <Section title="Totais">
                  <Row label="Taxa de Entrega" value={fmtMoney(selected.delivery_fee)} />
                  <Row label="Total" value={<span className="font-bold text-primary">{fmtMoney(selected.total)}</span>} />
                </Section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase font-semibold text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

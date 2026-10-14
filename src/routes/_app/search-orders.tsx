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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatItemName, getItemPrice, normalizeOrderType } from "@/utils/order-utils";
import { toast } from "sonner";
import { SeletorDeEstabelecimento } from "@/components/orders/SeletorDeEstabelecimento";
import {
  PEDIDOS_POR_PAGINA,
  TODOS_OS_ESTABELECIMENTOS,
  escopoDaBusca,
  filtroDeTipoDoPedido,
} from "@/lib/orders/buscaDePedidos";

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
  /** Nome da loja, vindo da ligação real pedido -> loja no banco. */
  loja?: { name: string | null } | null;
};

type Filtros = {
  establishment: string;
  customer: string;
  phone: string;
  orderNumber: string;
  startDate: string;
  endDate: string;
  status: string;
  payment: string;
  type: string;
};

const FILTROS_PADRAO: Filtros = {
  establishment: TODOS_OS_ESTABELECIMENTOS,
  customer: "",
  phone: "",
  orderNumber: "",
  startDate: "",
  endDate: "",
  status: "all",
  payment: "all",
  type: "all",
};

const MSG_SEM_RESULTADO = "Nenhum pedido encontrado para os filtros selecionados.";
const MSG_ANTES_DA_BUSCA = "Nenhum pedido. Ajuste os filtros e clique em Buscar.";

const STATUS_OPTIONS = [
  "pendente",
  "preparando",
  "pronto",
  "saiu_entrega",
  "entregue",
  "concluido",
  "cancelado",
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
  const { user, isSuperAdmin, rolesLoading } = useAuth();
  // Lojas do próprio usuário (só usado para quem NÃO é administrador geral).
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderRow | null>(null);

  const [filters, setFilters] = useState<Filtros>(FILTROS_PADRAO);
  // Filtros da última busca feita: trocar de página usa estes, não o que
  // estiver digitado no formulário e ainda não foi buscado.
  const [applied, setApplied] = useState<Filtros | null>(null);
  const [appliedStoreName, setAppliedStoreName] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenants() {
      if (!user || rolesLoading) return;
      if (isSuperAdmin) {
        // O administrador não precisa da lista inteira de ids: escolhe a loja
        // no seletor, e o banco já lhe permite ver todas.
        setTenantIds([]);
        setTenantsLoaded(true);
        return;
      }
      const { data } = await supabase.from("pizzerias").select("id").eq("owner_id", user.id);
      setTenantIds((data || []).map((p) => p.id));
      setTenantsLoaded(true);
    }
    setTenantsLoaded(false);
    loadTenants();
  }, [user, isSuperAdmin, rolesLoading]);

  async function runSearch(f: Filtros, targetPage: number) {
    if (rolesLoading || !tenantsLoaded) {
      toast.error("Ainda carregando suas permissões. Tente de novo em instantes.");
      return;
    }
    const escopo = escopoDaBusca({
      isSuperAdmin,
      lojaEscolhida: isSuperAdmin ? f.establishment : "",
      minhasLojas: tenantIds,
    });
    if (escopo.tipo === "nenhuma") {
      toast.error("Nenhuma loja encontrada");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const from = targetPage * PEDIDOS_POR_PAGINA;
      let q = supabase
        .from("orders")
        .select("*, loja:pizzerias!orders_tenant_id_fkey(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PEDIDOS_POR_PAGINA - 1);

      if (escopo.tipo === "uma") q = q.eq("tenant_id", escopo.lojaId);
      if (escopo.tipo === "minhas") q = q.in("tenant_id", escopo.lojaIds);
      // escopo "todas": sem filtro de loja — o banco só devolve o que este
      // usuário pode ver (o administrador geral vê todas as lojas).

      if (f.customer.trim()) q = q.ilike("customer_name", `%${f.customer.trim()}%`);
      if (f.phone.trim()) q = q.ilike("customer_phone", `%${f.phone.trim()}%`);
      if (f.orderNumber.trim()) {
        const n = Number(f.orderNumber.trim());
        if (!isNaN(n)) q = q.eq("order_number", n);
      }
      if (f.startDate) q = q.gte("created_at", new Date(f.startDate).toISOString());
      if (f.endDate) {
        const end = new Date(f.endDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (f.status !== "all") q = q.eq("status", f.status);
      if (f.payment !== "all") q = q.eq("payment_method", f.payment);
      // Tipo do pedido agora é filtrado no banco (antes era depois de chegar),
      // para a contagem e as páginas saírem certas.
      const tipo = filtroDeTipoDoPedido(f.type);
      if (tipo) q = q.or(tipo);

      const { data, error, count } = await q;
      if (error) throw error;

      setRows((data || []) as unknown as OrderRow[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setSearched(true);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Erro ao buscar pedidos";
      setErrorMsg("Não foi possível buscar os pedidos. Tente novamente.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function onSearchClick() {
    setApplied(filters);
    setAppliedStoreName(storeName);
    runSearch(filters, 0);
  }

  function goToPage(p: number) {
    if (!applied) return;
    runSearch(applied, p);
  }

  function resetFilters() {
    setFilters(FILTROS_PADRAO);
    setStoreName(null);
    setApplied(null);
    setAppliedStoreName(null);
    setRows([]);
    setTotal(0);
    setPage(0);
    setSearched(false);
    setErrorMsg(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PEDIDOS_POR_PAGINA));
  const showStore = isSuperAdmin;
  const emptyMessage = loading
    ? "Buscando..."
    : errorMsg
      ? errorMsg
      : searched
        ? MSG_SEM_RESULTADO
        : MSG_ANTES_DA_BUSCA;
  const appliedChips = applied ? describeApplied(applied, isSuperAdmin, appliedStoreName) : [];

  const items = useMemo(() => {
    if (!selected) return [];
    const raw = selected.items;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
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
          {/* Só o administrador geral vê este campo. Esconder não é a
              proteção: o banco também só entrega pedidos das lojas que a
              pessoa pode ver. */}
          {isSuperAdmin && (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="filtro-estabelecimento">Estabelecimento</Label>
              <SeletorDeEstabelecimento
                id="filtro-estabelecimento"
                value={filters.establishment}
                onChange={(v, loja) => {
                  setFilters((f) => ({ ...f, establishment: v }));
                  setStoreName(loja?.name ?? null);
                }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Nome do Cliente</Label>
            <Input
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              placeholder="Ex: João"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input
              value={filters.phone}
              onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nº do Pedido</Label>
            <Input
              value={filters.orderNumber}
              onChange={(e) => setFilters({ ...filters, orderNumber: e.target.value })}
              placeholder="123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters({ ...filters, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data Inicial</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data Final</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de Pagamento</Label>
            <Select
              value={filters.payment}
              onValueChange={(v) => setFilters({ ...filters, payment: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PAYMENT_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo do Pedido</Label>
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onSearchClick} disabled={loading || rolesLoading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
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
          <Badge variant="secondary">{total} pedido(s)</Badge>
        </div>
        {appliedChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
            <span className="text-xs text-muted-foreground self-center">Filtros aplicados:</span>
            {appliedChips.map((c) => (
              <Badge key={c} variant="outline" className="font-normal">
                {c}
              </Badge>
            ))}
          </div>
        )}
        {/* Celular: um card por pedido, com o essencial — uma tabela de 6
            colunas em 360px vira letra ilegível com rolagem lateral. */}
        <div className="divide-y md:hidden">
          {rows.length === 0 ? (
            <div
              className={`py-8 text-center text-sm ${errorMsg && !loading ? "text-destructive" : "text-muted-foreground"}`}
            >
              {emptyMessage}
            </div>
          ) : (
            rows.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o)}
                className="flex w-full flex-col gap-1 p-4 text-left active:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold">#{o.order_number}</span>
                  <Badge variant="outline">{o.status || "—"}</Badge>
                </div>
                {showStore && (
                  <div className="truncate text-xs font-medium text-primary">
                    {o.loja?.name || "—"}
                  </div>
                )}
                <div className="text-sm font-medium">{o.customer_name || "—"}</div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{fmtDateTime(o.created_at)}</span>
                  <span>{o.payment_method || "—"}</span>
                </div>
                <div className="text-sm font-bold text-primary">{fmtMoney(o.total)}</div>
              </button>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                {showStore && <TableHead>Estabelecimento</TableHead>}
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
                  <TableCell
                    colSpan={showStore ? 7 : 6}
                    className={`text-center py-8 ${errorMsg && !loading ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                    <TableCell className="font-mono">#{o.order_number}</TableCell>
                    {showStore && (
                      <TableCell className="max-w-[220px] truncate">
                        {o.loja?.name || "—"}
                      </TableCell>
                    )}
                    <TableCell>{o.customer_name || "—"}</TableCell>
                    <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                    <TableCell>{fmtMoney(o.total)}</TableCell>
                    <TableCell>{o.payment_method || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.status || "—"}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {total > PEDIDOS_POR_PAGINA && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground">
              Página {page + 1} de {totalPages} · mostrando {page * PEDIDOS_POR_PAGINA + 1}–
              {page * PEDIDOS_POR_PAGINA + rows.length} de {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page === 0}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page + 1 >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
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
                  {showStore && <Row label="Estabelecimento" value={selected.loja?.name} />}
                  <Row label="Data/Hora" value={fmtDateTime(selected.created_at)} />
                  <Row label="Tipo" value={normalizeOrderType(selected)} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Pagamento" value={selected.payment_method} />
                  {selected.payment_status && (
                    <Row label="Status Pagamento" value={selected.payment_status} />
                  )}
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
                            <div className="font-medium">
                              {it.quantity || it.qty || 1}x {formatItemName(it)}
                            </div>
                            {(it.notes || it.observations || it.observacao) && (
                              <div className="text-xs text-muted-foreground">
                                Obs: {it.notes || it.observations || it.observacao}
                              </div>
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
                  <Row
                    label="Total"
                    value={
                      <span className="font-bold text-primary">{fmtMoney(selected.total)}</span>
                    }
                  />
                </Section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Resumo, em palavras, dos filtros usados na última busca. */
function describeApplied(f: Filtros, isSuperAdmin: boolean, storeName: string | null): string[] {
  const out: string[] = [];
  if (isSuperAdmin) {
    out.push(
      f.establishment === TODOS_OS_ESTABELECIMENTOS
        ? "Todos os estabelecimentos"
        : `Estabelecimento: ${storeName || "selecionado"}`,
    );
  }
  if (f.customer.trim()) out.push(`Cliente: ${f.customer.trim()}`);
  if (f.phone.trim()) out.push(`Telefone: ${f.phone.trim()}`);
  if (f.orderNumber.trim()) out.push(`Pedido nº ${f.orderNumber.trim()}`);
  if (f.status !== "all") out.push(`Status: ${f.status}`);
  if (f.startDate) out.push(`De ${f.startDate.split("-").reverse().join("/")}`);
  if (f.endDate) out.push(`Até ${f.endDate.split("-").reverse().join("/")}`);
  if (f.payment !== "all") out.push(`Pagamento: ${f.payment}`);
  if (f.type !== "all") {
    out.push(`Tipo: ${TYPE_OPTIONS.find((t) => t.value === f.type)?.label ?? f.type}`);
  }
  return out;
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

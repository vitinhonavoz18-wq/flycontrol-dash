import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, ChevronLeft, ChevronRight, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { listarClientes, atualizarCliente } from "@/lib/marketing/marketing.functions";
import type { ClienteMarketing } from "@/lib/marketing/marketing.functions";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";

/**
 * A lista de clientes.
 *
 * A paginação acontece NO SERVIDOR. A tela pede 25 por vez e nunca traz a base
 * inteira para o navegador — com dez mil clientes, trazer tudo seria como
 * despejar o arquivo de comandas inteiro na mesa para achar um nome.
 *
 * A busca aceita nome ou telefone. Se o que foi digitado parece um telefone,
 * a procura é pelo número padronizado, então "(71) 99999-1234" acha o cliente
 * mesmo que ele esteja guardado como 5571999991234.
 */

const POR_PAGINA = 25;

const dinheiro = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const quando = (iso: string | null) => {
  if (!iso) return "—";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
};

export function ClientesMarketing({ tenantId }: { tenantId: string }) {
  const buscar = useServerFn(listarClientes);
  const salvar = useServerFn(atualizarCliente);

  const [clientes, setClientes] = useState<ClienteMarketing[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [somenteAptos, setSomenteAptos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await buscar({
        data: {
          tenantId,
          busca: buscaAplicada || undefined,
          pagina,
          porPagina: POR_PAGINA,
          somenteAptos,
        },
      });
      setClientes(r.clientes);
      setTotal(r.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui carregar os clientes");
    } finally {
      setCarregando(false);
    }
  }, [buscar, tenantId, buscaAplicada, pagina, somenteAptos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Trocar de filtro tem de voltar para a primeira página: senão a pessoa
  // filtra, sobra uma página e a tela fica em branco na página 4.
  useEffect(() => {
    setPagina(1);
  }, [buscaAplicada, somenteAptos, tenantId]);

  async function alternarConsentimento(c: ClienteMarketing) {
    setSalvandoId(c.id);
    try {
      await salvar({
        data: { tenantId, customerId: c.id, marketingOptIn: !c.marketing_opt_in },
      });
      setClientes((atual) =>
        atual.map((x) => (x.id === c.id ? { ...x, marketing_opt_in: !x.marketing_opt_in } : x)),
      );
      toast.success(
        c.marketing_opt_in
          ? "Cliente descadastrado das promoções"
          : "Cliente marcado como autorizado",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setSalvandoId(null);
    }
  }

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaAplicada(busca.trim());
          }}
        >
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={somenteAptos} onCheckedChange={setSomenteAptos} />
          Só quem aceita ofertas
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        {carregando
          ? "Carregando…"
          : `${total.toLocaleString("pt-BR")} cliente${total === 1 ? "" : "s"}${
              buscaAplicada ? ` para "${buscaAplicada}"` : ""
            }`}
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Total gasto</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Ticket médio</TableHead>
                  <TableHead className="hidden md:table-cell">Último pedido</TableHead>
                  <TableHead className="text-center">Aceita ofertas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}

                {!carregando && clientes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {buscaAplicada
                        ? "Ninguém com esse nome ou telefone."
                        : somenteAptos
                          ? "Ninguém autorizou receber ofertas ainda."
                          : "Nenhum cliente por aqui ainda. Cada pedido que entra vira um cliente aqui, sozinho."}
                    </TableCell>
                  </TableRow>
                )}

                {!carregando &&
                  clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.name || <span className="text-muted-foreground">Sem nome</span>}
                        {!c.is_mobile && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            fixo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatPhoneForDisplay(c.phone_e164)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.orders_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {dinheiro(c.total_spent_cents)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {dinheiro(c.ticket_medio_cents)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                        {quando(c.last_order_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => alternarConsentimento(c)}
                          disabled={salvandoId === c.id || !c.is_mobile}
                          title={
                            !c.is_mobile
                              ? "Telefone fixo não recebe WhatsApp"
                              : c.marketing_opt_in
                                ? "Clique para descadastrar"
                                : "Clique para marcar que ele autorizou"
                          }
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {salvandoId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : c.marketing_opt_in ? (
                            <>
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              Sim
                            </>
                          ) : (
                            <>
                              <ShieldOff className="h-4 w-4 text-muted-foreground" />
                              Não
                            </>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {ultimaPagina > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1 || carregando}
            onClick={() => setPagina((p) => p - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {pagina} de {ultimaPagina}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= ultimaPagina || carregando}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { qtd } from "@/lib/inventory/formato";
import { listarMovimentacoes, listarProdutosDeEstoque } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/movements")({ component: Movimentacoes });

/**
 * O extrato do estoque.
 *
 * Cada linha responde "por que o saldo mudou", com o saldo de antes e o de
 * depois. É o extrato do banco: nada aqui é apagado nem corrigido por cima —
 * quando algo entrou errado, aparece uma linha de estorno ao lado, e as duas
 * ficam.
 */

const ROTULO_DO_MOTIVO: Record<string, string> = {
  compra_fornecedor: "Compra de fornecedor",
  reposicao: "Reposição",
  devolucao_cliente: "Devolução de cliente",
  ajuste_positivo: "Ajuste (sobrou)",
  inventario_entrada: "Inventário",
  estorno_cancelamento: "Estorno por cancelamento",
  outra_entrada: "Outra entrada",
  venda_online: "Venda pelo cardápio",
  venda_balcao: "Venda no balcão",
  perda: "Perda",
  vencido: "Produto vencido",
  danificado: "Produto danificado",
  uso_interno: "Uso interno",
  ajuste_negativo: "Ajuste (faltou)",
  inventario_saida: "Inventário",
  outra_saida: "Outra saída",
};

type Movimento = {
  id: string;
  product_id: string;
  direction: string;
  reason: string;
  quantity: number;
  unit: string;
  quantity_base: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  created_at: string;
};

const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "0", rotulo: "Tudo" },
];

function Movimentacoes() {
  const { tenantId } = useLojaDoEstoque();
  const listar = useServerFn(listarMovimentacoes);
  const listarProdutos = useServerFn(listarProdutosDeEstoque);

  const [itens, setItens] = useState<Movimento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [periodo, setPeriodo] = useState("30");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      const dias = Number(periodo);
      let desdeIso: string | undefined;
      if (dias > 0) {
        const d = new Date();
        d.setDate(d.getDate() - dias);
        desdeIso = d.toISOString();
      }

      const r = await listar({ data: { tenantId, pagina, desdeIso } });
      setItens(r.itens as unknown as Movimento[]);
      setTotal(r.total);

      // Os nomes vêm numa consulta só, e não um pedido por linha — 40 linhas
      // dariam 40 idas ao servidor para escrever 40 nomes.
      const p = await listarProdutos({ data: { tenantId, pagina: 1, apenasAtivos: false } });
      setNomes(Object.fromEntries(p.itens.map((x) => [x.id, x.name])));
    } catch (e) {
      const bruto = e instanceof Error ? e.message : "";
      setErro(
        bruto.includes("does not exist") || bruto.includes("schema cache")
          ? "O módulo de Estoque ainda não foi instalado no banco desta conta."
          : bruto || "Não consegui carregar as movimentações.",
      );
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, pagina, periodo, listar, listarProdutos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const paginas = Math.max(1, Math.ceil(total / 40));

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={periodo}
          onValueChange={(v) => {
            setPeriodo(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => (
              <SelectItem key={p.valor} value={p.valor}>
                {p.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-400">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 font-medium">Nenhuma movimentação no período</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Toda entrada, saída e ajuste aparece aqui, com o saldo antes e depois.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {itens.map((m) => (
              <LinhaDoExtrato key={m.id} movimento={m} nome={nomes[m.product_id]} />
            ))}
          </div>

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pagina} de {paginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function LinhaDoExtrato({ movimento, nome }: { movimento: Movimento; nome?: string }) {
  const entrada = movimento.direction === "in";
  const quando = new Date(movimento.created_at);

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            entrada
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {entrada ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-black tabular-nums ${
                entrada
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {entrada ? "+" : "−"}
              {qtd(Math.abs(Number(movimento.quantity_base)))}
            </span>
            <span className="truncate font-medium">{nome ?? "Produto"}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            {ROTULO_DO_MOTIVO[movimento.reason] ?? movimento.reason}
            {movimento.unit !== undefined &&
              Number(movimento.quantity) !== Math.abs(Number(movimento.quantity_base)) && (
                <>
                  {" "}
                  · registrado como {qtd(movimento.quantity)} {movimento.unit}
                </>
              )}
          </p>

          {movimento.notes && (
            <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
              {movimento.notes}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <p className="tabular-nums">
            {qtd(movimento.stock_before)} →{" "}
            <strong className="text-foreground">{qtd(movimento.stock_after)}</strong>
          </p>
          <p className="mt-0.5">
            {quando.toLocaleDateString("pt-BR")}{" "}
            {quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

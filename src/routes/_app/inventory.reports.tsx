import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Download, PackageX, ShoppingCart, TrendingDown, Wallet } from "lucide-react";
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
import { deCentavos, qtd } from "@/lib/inventory/formato";
import { relatorioDeEstoque, type RelatorioDeEstoque } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/reports")({ component: Relatorios });

type Periodo = "7" | "30" | "90";

const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  "7": "Últimos 7 dias",
  "30": "Últimos 30 dias",
  "90": "Últimos 90 dias",
};

/**
 * As perguntas de fim de mês: quanto gastei comprando, quanto saiu, quanto
 * perdi, e o que está parado ocupando prateleira e dinheiro.
 *
 * "Parado há X dias" olha o histórico inteiro, não só o período escolhido —
 * senão um produto parado há seis meses apareceria como "parado há 30 dias"
 * só porque o filtro da tela mostra o último mês, e a informação que importa
 * (este produto não gira) ficaria escondida.
 */
function Relatorios() {
  const { tenantId } = useLojaDoEstoque();
  const buscar = useServerFn(relatorioDeEstoque);

  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [dados, setDados] = useState<RelatorioDeEstoque | null>(null);
  const [carregando, setCarregando] = useState(true);

  const intervalo = useMemo(() => {
    const ate = new Date();
    const de = new Date();
    de.setDate(de.getDate() - Number(periodo));
    de.setHours(0, 0, 0, 0);
    return { de: de.toISOString(), ate: ate.toISOString() };
  }, [periodo]);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setDados(await buscar({ data: { tenantId, ...intervalo } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar o relatório.");
    } finally {
      setCarregando(false);
    }
  }, [buscar, intervalo, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Baixa a planilha.
   *
   * O ponto e vírgula (e não a vírgula) separa as colunas porque é o que o
   * Excel em português entende sem pedir configuração. E o número vai com
   * vírgula decimal pelo mesmo motivo: com ponto, a planilha trataria 1.5
   * como texto e nenhuma soma funcionaria.
   */
  function baixarPlanilha() {
    if (!dados) return;

    const cabecalho = [
      "Produto",
      "Unidade",
      "Entrou",
      "Vendido",
      "Perdido",
      "Saldo atual",
      "Custo unitario (R$)",
      "Valor parado (R$)",
      "Dias sem mover",
    ];

    const numero = (n: number) => String(n).replace(".", ",");
    const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
    // Ponto e vírgula dentro do nome do produto quebraria a coluna.
    const texto = (s: string) => `"${s.replace(/"/g, '""')}"`;

    const linhas = dados.linhas.map((l) =>
      [
        texto(l.produto),
        texto(l.unidade),
        numero(l.entrou),
        numero(l.saiu_vendido),
        numero(l.perdido),
        numero(l.saldo_atual),
        reais(l.custo_cents),
        reais(l.valor_parado_cents),
        l.dias_sem_mover ?? "",
      ].join(";"),
    );

    // O BOM no começo faz o Excel abrir os acentos corretamente; sem ele,
    // "Manteiga Ghee" vira "Manteiga GhÃªe" na planilha do cliente.
    const conteudo = `\uFEFF${[cabecalho.join(";"), ...linhas].join("\n")}`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8;" }));

    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-${ROTULO_DO_PERIODO[periodo].toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("Planilha baixada.");
  }

  if (carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dados) return null;

  const parados = dados.linhas
    .filter((l) => l.saldo_atual > 0 && (l.dias_sem_mover === null || l.dias_sem_mover >= 30))
    .sort((a, b) => b.valor_parado_cents - a.valor_parado_cents)
    .slice(0, 10);

  const maisSaem = dados.linhas.filter((l) => l.saiu_vendido > 0).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROTULO_DO_PERIODO) as Periodo[]).map((p) => (
              <SelectItem key={p} value={p}>
                {ROTULO_DO_PERIODO[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={baixarPlanilha}>
          <Download className="mr-2 h-4 w-4" />
          Baixar planilha
        </Button>
      </div>

      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo
          titulo="Comprado no período"
          valor={deCentavos(dados.compras_cents)}
          icone={ShoppingCart}
        />
        <Resumo
          titulo="Vendido no balcão"
          valor={deCentavos(dados.vendido_balcao_cents)}
          icone={BarChart3}
        />
        <Resumo
          titulo="Perdas"
          valor={deCentavos(dados.perdas_cents)}
          icone={TrendingDown}
          alerta={dados.perdas_cents > 0}
        />
        <Resumo
          titulo="Parado em estoque"
          valor={deCentavos(dados.valor_em_estoque_cents)}
          icone={Wallet}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">O que mais sai</h2>
            {maisSaem.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma saída registrada no período.
              </p>
            ) : (
              <div className="space-y-2">
                {maisSaem.map((l) => (
                  <div key={l.product_id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{l.produto}</span>
                    <span className="shrink-0 text-sm font-medium">
                      {qtd(l.saiu_vendido)} {l.unidade}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="mb-1 font-semibold">Dinheiro parado</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Em estoque e sem movimento há 30 dias ou mais.
            </p>
            {parados.length === 0 ? (
              <p className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <PackageX className="h-6 w-6" />
                Nada parado por aqui. Todo o estoque está girando.
              </p>
            ) : (
              <div className="space-y-2">
                {parados.map((l) => (
                  <div key={l.product_id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{l.produto}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.dias_sem_mover === null
                          ? "nunca se moveu"
                          : `parado há ${l.dias_sem_mover} dias`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">
                      {deCentavos(l.valor_parado_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  icone: Icone,
  alerta,
}: {
  titulo: string;
  valor: string;
  icone: typeof Wallet;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icone className="h-4 w-4" />
          {titulo}
        </div>
        <p className={`text-xl font-semibold ${alerta ? "text-destructive" : ""}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}

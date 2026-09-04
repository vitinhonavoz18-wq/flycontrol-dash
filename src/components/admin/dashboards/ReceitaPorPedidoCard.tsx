import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/billing/money";
import { receitaGlobalPorPedido } from "@/lib/billing/receitaGlobal.functions";
import type { ReceitaGlobal } from "@/lib/billing/receitaGlobal";

/**
 * O card do faturamento da FlyControl com a cobrança por pedido.
 *
 * NÃO CONFUNDIR COM O CARD AO LADO
 *
 * "Vendas das lojas" é o dinheiro que o cliente final paga pela pizza — é do
 * restaurante. Este aqui é o que a plataforma cobra por pedido processado. São
 * dois bolsos diferentes: o do lojista e o da FlyControl.
 *
 * DE ONDE VEM O NÚMERO
 *
 * Do servidor, da mesma conta que emite a fatura de cada loja. A tela não
 * multiplica nada: ela pede o valor pronto e mostra.
 *
 * TEMPO REAL
 *
 * Quando um pedido entra na cobrança de qualquer loja, o contador daquele
 * ciclo muda no banco — e a tela pergunta de novo. O administrador não precisa
 * recarregar a página para ver o total andar.
 */
export function ReceitaPorPedidoCard() {
  const buscar = useServerFn(receitaGlobalPorPedido);
  const [dados, setDados] = useState<ReceitaGlobal | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await buscar({ data: undefined });
      // Resposta sem o total é resposta que não serve: melhor mostrar traço do
      // que escrever "R$ 0,00" para quem faturou.
      setDados(r && typeof r.totalCents === "number" ? r : null);
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const canal = supabase
      .channel("insights-receita-por-pedido")
      // O ciclo é o que guarda a contagem de pedidos faturáveis. Ouvir ele
      // custa muito menos que ouvir a tabela de pedidos inteira.
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_cycles" }, () => {
        void carregar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
          Receita FlyControl (por pedido)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary tabular-nums">
          {carregando ? "—" : dados ? formatCents(dados.totalCents) : "—"}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {dados
            ? `${dados.pedidos.toLocaleString("pt-BR")} ${dados.pedidos === 1 ? "pedido cobrado" : "pedidos cobrados"} · ${dados.lojas.length} ${dados.lojas.length === 1 ? "loja" : "lojas"}`
            : "Soma da cobrança por pedido de todas as lojas"}
        </p>
      </CardContent>
    </Card>
  );
}

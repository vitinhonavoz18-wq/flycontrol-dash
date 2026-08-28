import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Crown, Sparkles, TrendingUp, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/billing/money";
import { progressoDoCents, type ProgressoNaTela } from "@/lib/billing/cents.functions";
import { CentsTrilha } from "./CentsTrilha";

/**
 * A tela do CENTS: quanto a loja já vendeu, quanto paga agora e quanto falta
 * para pagar menos.
 *
 * TODOS OS NÚMEROS VÊM DO SERVIDOR
 *
 * Esta tela não calcula dinheiro. Ela recebe pronto do mesmo lugar que gera a
 * fatura — se ela fizesse a conta por conta própria, um dia mostraria um
 * valor e a cobrança viria outro, e a diferença só apareceria no boleto.
 *
 * QUANDO CHEGA UM PEDIDO NOVO
 *
 * A tela não soma 1 sozinha: ela pede os números de novo ao servidor. Somar
 * no navegador contaria pedido cancelado, pedido repetido e aviso que chegou
 * duas vezes — e o contador iria descolando da fatura ao longo do dia.
 */

type Props = {
  tenantId: string | null;
  /**
   * Avisa a página quem está mandando no preço.
   *
   * Sem isto a tela mostraria duas contas ao mesmo tempo: este cartão dizendo
   * "seu próximo pedido custa R$ 0,60" e o cartão antigo logo abaixo dizendo
   * "R$ 0,70 por pedido". É o cardápio da parede e o cardápio da mesa com
   * preços diferentes — o cliente não sabe em qual acreditar e liga para o
   * suporte. Quem responde é sempre o servidor, nunca esta tela.
   */
  aoCarregar?: (dados: ProgressoNaTela | null) => void;
};

export function CentsProgresso({ tenantId, aoCarregar }: Props) {
  const buscar = useServerFn(progressoDoCents);
  const [dados, setDados] = useState<ProgressoNaTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  // Sobe a cada pedido novo — é o que dispara a reação do indicador e o "+1".
  const [pulso, setPulso] = useState(0);
  const [chegouAgora, setChegouAgora] = useState(false);
  const nivelAnterior = useRef<number | null>(null);
  const totalAnterior = useRef<number | null>(null);

  // Guardado numa referência para o aviso à página não reiniciar a busca a
  // cada desenho da tela — senão o cartão ficaria pedindo os números em
  // círculo, sem parar.
  const avisar = useRef(aoCarregar);
  avisar.current = aoCarregar;

  const carregar = useCallback(async () => {
    try {
      const r = await buscar({});
      setDados(r);
      setFalhou(false);
      avisar.current?.(r);

      // O "+1 pedido" só aparece quando a conta REALMENTE subiu.
      //
      // Um pedido entra na conta quando vira operação (sai de "novo" para
      // "preparando"), e não no instante em que cai na tela. Se o aviso
      // piscasse a cada pedido que chega, o lojista veria "+1" e o número do
      // lado parado — como o garçom cantar o pedido antes de a cozinha
      // aceitar.
      const antes = totalAnterior.current;
      const agora = r?.pedidos ?? null;
      totalAnterior.current = agora;
      if (antes !== null && agora !== null && agora > antes) {
        setChegouAgora(true);
        setPulso((p) => p + 1);
        window.setTimeout(() => setChegouAgora(false), 2600);
      }
    } catch {
      setFalhou(true);
      avisar.current?.(null);
    } finally {
      setCarregando(false);
    }
  }, [buscar]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
  }, [carregar, tentativa]);

  // Movimento de pedido em tempo real.
  //
  // Escuta o pedido que chega E o pedido que muda de status, porque é a
  // mudança de status que faz o pedido entrar (ou sair) da conta: um pedido
  // cancelado precisa fazer o número descer na hora, não só o pedido novo
  // fazer subir.
  useEffect(() => {
    if (!tenantId) return;
    const canal = supabase
      .channel(`cents-progresso-${tenantId}`)
      .on(
        "postgres_changes",
        // O filtro por loja não é enfeite: sem ele, o painel de uma empresa
        // reagiria ao pedido de outra.
        { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
        () => {
          // Quem decide se este pedido conta é o servidor. A tela só pergunta
          // de novo e mostra a resposta.
          void carregar();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [tenantId, carregar]);

  // Subiu de nível durante a sessão: comemora uma vez, sem travar a operação.
  useEffect(() => {
    if (!dados?.comFaixas) return;
    const anterior = nivelAnterior.current;
    nivelAnterior.current = dados.nivel;
    if (anterior === null || dados.nivel <= anterior) return;

    toast.success(
      dados.noMaximo
        ? `CENTS MAX desbloqueado! Seus próximos pedidos custam ${formatCents(dados.precoDoProximoPedidoCents)}.`
        : `Nova fase! Seus próximos pedidos agora custam ${formatCents(dados.precoDoProximoPedidoCents)}.`,
      { duration: 8000, icon: dados.noMaximo ? "👑" : "⚡" },
    );
  }, [dados?.nivel, dados?.comFaixas, dados?.noMaximo, dados?.precoDoProximoPedidoCents]);

  if (carregando) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Erro nunca vira número inventado: o cliente precisa saber que não
  // carregou, e não ver "0 pedidos" e achar que não vendeu nada hoje.
  if (falhou) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold">Não consegui carregar sua progressão CENTS</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Seus pedidos e sua cobrança estão salvos — só esta tela não carregou.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loja que não está no CENTS, ou ainda na regra antiga: esta tela não é dela.
  if (!dados || !dados.comFaixas) return null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> CENTS
            </p>
            <h2 className="mt-0.5 text-lg font-black">Quanto mais você vende, menos paga</h2>
            <p className="text-sm text-muted-foreground">Sua evolução neste ciclo</p>
          </div>

          {dados.recorde && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-right">
              <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-3 w-3" aria-hidden="true" /> Seu recorde
              </p>
              <p className="text-sm font-black">
                {dados.recorde.pedidos.toLocaleString("pt-BR")} pedidos
              </p>
            </div>
          )}
        </div>

        {/* O número que responde "quantos pedidos eu fiz?" */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="relative">
            <p className="text-5xl font-black leading-none tabular-nums">
              {dados.pedidos.toLocaleString("pt-BR")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">pedidos neste ciclo</p>

            {chegouAgora && (
              <span
                role="status"
                className="absolute -right-3 -top-4 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black text-primary-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
              >
                +1 pedido
              </span>
            )}
          </div>

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {dados.noMaximo ? (
                <Crown className="h-3 w-3 text-primary" aria-hidden="true" />
              ) : (
                <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
              )}
              {dados.noMaximo ? "CENTS MAX" : `Nível ${dados.nivel}`}
            </p>
            <p className="text-2xl font-black text-primary">
              {formatCents(dados.precoDoProximoPedidoCents)}
            </p>
            <p className="text-[11px] text-muted-foreground">por novo pedido</p>
          </div>
        </div>

        <CentsTrilha
          posicao={dados.posicaoNaTrilha}
          marcos={dados.marcos}
          noMaximo={dados.noMaximo}
          pulso={pulso}
        />

        {/* A frase que responde "quanto falta para eu pagar menos?" */}
        <div className="rounded-xl border bg-muted/40 p-3.5">
          {dados.proxima ? (
            <p className="text-sm">
              <TrendingUp
                className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary"
                aria-hidden="true"
              />
              {dados.proxima.faltam === 1 ? (
                <>
                  <strong className="text-foreground">Falta 1 pedido</strong> para seus próximos
                  pedidos custarem{" "}
                  <strong className="text-primary">{formatCents(dados.proxima.precoCents)}</strong>.
                </>
              ) : (
                <>
                  Faltam{" "}
                  <strong className="text-foreground">
                    {dados.proxima.faltam.toLocaleString("pt-BR")} pedidos
                  </strong>{" "}
                  para seus próximos pedidos custarem{" "}
                  <strong className="text-primary">{formatCents(dados.proxima.precoCents)}</strong>.
                </>
              )}
              <span className="ml-1 text-muted-foreground">
                ({dados.pedidos.toLocaleString("pt-BR")} de{" "}
                {dados.proxima.meta.toLocaleString("pt-BR")})
              </span>
            </p>
          ) : (
            <p className="text-sm">
              <Crown
                className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary"
                aria-hidden="true"
              />
              <strong className="text-foreground">Você chegou ao maior nível do CENTS.</strong> Seus
              próximos pedidos neste ciclo custam apenas{" "}
              <strong className="text-primary">
                {formatCents(dados.precoDoProximoPedidoCents)}
              </strong>{" "}
              cada.
            </p>
          )}
        </div>

        {/* A resposta para "quanto já vou pagar neste ciclo?" */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Acumulado neste ciclo</p>
            <p className="text-2xl font-black">{formatCents(dados.totalCents)}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDetalhesAbertos((a) => !a)}
            aria-expanded={detalhesAbertos}
          >
            Ver detalhes da cobrança
            <ChevronDown
              className={`ml-1 h-4 w-4 transition-transform ${detalhesAbertos ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>

        {/* O detalhamento: é o que evita a ligação para o suporte perguntando
            de onde saiu o valor da fatura. */}
        {detalhesAbertos && (
          <div className="rounded-xl border bg-background p-3">
            {dados.faixas.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Nenhum pedido faturável neste ciclo ainda.
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {dados.faixas.map((f) => (
                    <li key={f.nivel} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          Pedidos {f.de}
                          {f.ate === null ? "+" : `–${f.ate}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {f.quantidade.toLocaleString("pt-BR")} × {formatCents(f.precoCents)}
                        </p>
                      </div>
                      <strong className="text-sm tabular-nums">
                        {formatCents(f.subtotalCents)}
                      </strong>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-bold">Total</span>
                  <strong className="text-sm tabular-nums">{formatCents(dados.totalCents)}</strong>
                </div>
              </>
            )}
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              O valor fecha no fim do ciclo. Pedido cancelado sai da conta — a cobrança considera só
              os pedidos que realmente entraram na operação.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CentsTrilha } from "@/components/cents/CentsTrilha";
import { supabase } from "@/integrations/supabase/client";
import { progressoDoCents, type ProgressoNaTela } from "@/lib/billing/cents.functions";
import { formatCents } from "@/lib/billing/money";

/**
 * A faixa do CENTS na tela de Pedidos.
 *
 * O QUE ESTAVA ERRADO ANTES
 *
 * Esta faixa mostrava o modelo ANTIGO: uma meta única de 500 pedidos para
 * "desbloquear o Benefício Ouro" de R$ 0,40. Só que o preço deixou de
 * funcionar assim — hoje ele cai em degraus, e cada degrau vale dali para
 * frente.
 *
 * Pior: os números vinham de outro caderno (a tabela do clube), enquanto a
 * cobrança de verdade era calculada em outro lugar. Duas contas para a mesma
 * pergunta é o caderno de reservas do salão discordando do caderno do
 * telefone: um dia eles divergem, e o cliente descobre pela fatura.
 *
 * O QUE MUDOU
 *
 * Agora esta faixa pergunta exatamente para quem fecha a fatura — a mesma
 * função de servidor que a tela "Plano e cobrança" usa. Um caderno só.
 *
 * POR QUE A CONTA NÃO É FEITA AQUI
 *
 * O número que aparece na tela é o mesmo que vira fatura. Se o navegador
 * fizesse a conta, bastaria alguém mexer no que ele mostra para a tela contar
 * uma história e a cobrança contar outra.
 *
 * TEMPO REAL
 *
 * Quando entra um pedido — ou quando um pedido muda de status, porque é isso
 * que faz ele entrar ou sair da conta — a faixa pergunta de novo e se
 * atualiza sozinha. O dono não precisa recarregar a página para ver o
 * contador andar.
 */

function diasRestantes(fim: string | null): number | null {
  if (!fim) return null;
  const ms = new Date(fim).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function ClubCentsCard({ tenantId }: { tenantId: string | null }) {
  const buscar = useServerFn(progressoDoCents);
  const [dados, setDados] = useState<ProgressoNaTela | null>(null);
  const [pulso, setPulso] = useState(0);
  const [chegouAgora, setChegouAgora] = useState(false);
  const pedidosAnteriores = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await buscar({ data: tenantId ? { tenantId } : {} });
      // Resposta sem os números é resposta que não serve. Melhor sumir com a
      // faixa do que escrever "0 pedidos" para quem vendeu o dia inteiro.
      if (!r || typeof r.pedidos !== "number") {
        setDados(null);
        return;
      }
      setDados(r);
    } catch {
      setDados(null);
    }
  }, [buscar, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Escuta os pedidos desta loja. O filtro por loja não é enfeite: sem ele, o
  // painel de uma empresa reagiria ao pedido de outra.
  useEffect(() => {
    if (!tenantId) return;
    const canal = supabase
      .channel(`cents-faixa-pedidos-${tenantId}`)
      .on(
        "postgres_changes",
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

  // O "+1" que pisca quando o contador anda. Some sozinho — é confete, não
  // informação: quem perder o piscar continua vendo o número certo.
  useEffect(() => {
    const agora = dados?.pedidos ?? null;
    const antes = pedidosAnteriores.current;
    pedidosAnteriores.current = agora;
    if (antes === null || agora === null || agora <= antes) return;
    setPulso((p) => p + 1);
    setChegouAgora(true);
    const t = setTimeout(() => setChegouAgora(false), 2600);
    return () => clearTimeout(t);
  }, [dados?.pedidos]);

  // Loja fora do CENTS, ou ainda num ciclo da regra antiga: esta faixa não é
  // dela. Sumir é melhor do que mostrar uma trilha de degraus para quem é
  // cobrado por preço único — seria prometer um desconto que não vale.
  if (!dados || !dados.comFaixas) return null;

  const dias = diasRestantes(dados.cicloFim);

  return (
    <Card className="mb-6 overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Clube CENTS
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="relative text-3xl font-black leading-none tabular-nums">
                {dados.pedidos.toLocaleString("pt-BR")}
                {chegouAgora && (
                  <span
                    role="status"
                    className="absolute -right-2 -top-4 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black text-primary-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                  >
                    +1
                  </span>
                )}
              </span>
              <span className="pb-0.5 text-sm text-muted-foreground">pedidos neste ciclo</span>
            </div>
          </div>

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-3.5 py-1.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {dados.noMaximo ? (
                <Crown className="h-3 w-3 text-primary" aria-hidden="true" />
              ) : (
                <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
              )}
              {dados.noMaximo ? "CENTS MAX" : dados.rotuloDoNivel}
            </p>
            <p className="text-xl font-black leading-tight text-primary">
              {formatCents(dados.precoDoProximoPedidoCents)}
            </p>
            <p className="text-[10px] text-muted-foreground">por novo pedido</p>
          </div>
        </div>

        {/* A mesma trilha da tela de cobrança. Um desenho só para os dois
            lugares: se um dia o preço mudar, não existe uma segunda barra
            para alguém esquecer de atualizar.

            SÓ ESTICA PARA OS LADOS, NUNCA PARA BAIXO. A trilha reserva um
            espaço embaixo dela para os rótulos dos marcos ("100", "R$ 0,60")
            ficarem pendurados. Aqui já houve uma margem negativa embaixo para
            deixar o cartão compacto, e ela comia justamente esse espaço: o
            preço do marco caía em cima da frase seguinte. O espaço de baixo
            quem reserva é a própria trilha — daqui não se mexe nele. */}
        <div className="-mx-6">
          <CentsTrilha
            posicao={dados.posicaoNaTrilha}
            marcos={dados.marcos}
            noMaximo={dados.noMaximo}
            pulso={pulso}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {dados.proxima ? (
            <p>
              <TrendingUp
                className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary"
                aria-hidden="true"
              />
              {/* Frase curta de propósito. A anterior — "para o próximo
                  pedido custar" — ocupava quase a largura toda do cartão e
                  encostava no rótulo do marco. Aqui o essencial é: quantos
                  faltam, e para quanto o preço cai. */}
              {dados.proxima.faltam === 1 ? "Falta" : "Faltam"}{" "}
              <strong>{dados.proxima.faltam.toLocaleString("pt-BR")}</strong>{" "}
              {dados.proxima.faltam === 1 ? "pedido" : "pedidos"} para pagar{" "}
              <strong>{formatCents(dados.proxima.precoCents)}</strong>.
            </p>
          ) : (
            <p>
              <Crown
                className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary"
                aria-hidden="true"
              />
              Você está no melhor preço do CENTS:{" "}
              <strong>{formatCents(dados.precoDoProximoPedidoCents)}</strong> por pedido.
            </p>
          )}
          {dias !== null && (
            <span className="text-muted-foreground">
              {dias} {dias === 1 ? "dia restante" : "dias restantes"} no ciclo
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

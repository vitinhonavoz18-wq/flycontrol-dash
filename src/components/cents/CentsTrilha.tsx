import { Crown, Flame, Lock, Zap } from "lucide-react";
import { formatCents } from "@/lib/billing/money";
import type { MarcoDaTrilha } from "@/lib/billing/centsTiers";

/**
 * A trilha do CENTS: onde a loja está e o que falta para a próxima tarifa.
 *
 * A BARRA NÃO É PROPORCIONAL, E ISSO É DE PROPÓSITO
 *
 * As fases têm tamanhos bem diferentes (100, 150, 250 pedidos). Numa régua
 * proporcional, a primeira fase viraria um tracinho e quem está começando não
 * veria progresso nenhum — pareceria que o sistema travou. Aqui cada fase
 * ocupa uma fatia igual, e dentro da fatia o marcador anda proporcionalmente.
 * É o mapa do metrô: as estações não estão na distância real, estão espaçadas
 * para dar para ler.
 *
 * ANIMAÇÃO SEM BIBLIOTECA
 *
 * Só `transform` e `opacity`, que o navegador desenha na placa de vídeo. Nada
 * de biblioteca de animação para um indicador que flutua — seria carregar um
 * caminhão para levar uma pizza.
 */

type Props = {
  posicao: number;
  marcos: MarcoDaTrilha[];
  noMaximo: boolean;
  /** Sobe quando um pedido novo chega, para o indicador reagir. */
  pulso: number;
};

const ICONE_DO_NIVEL = { 2: Zap, 3: Flame, 4: Crown } as const;

export function CentsTrilha({ posicao, marcos, noMaximo, pulso }: Props) {
  // A folga nas laterais é para o último marco caber inteiro: ele fica em cima
  // do fim da barra, com metade do círculo e metade do preço passando do
  // limite. Sem a folga, "R$ 0,40" sairia cortado na borda do cartão.
  //
  // A FOLGA DE BAIXO PRECISA CABER O RÓTULO INTEIRO
  //
  // Embaixo de cada marco ficam DUAS linhas penduradas: o número de pedidos e
  // o preço ("250" e "R$ 0,50"). Elas são posicionadas por cima do desenho, e
  // por isso não empurram nada — quem precisa reservar o espaço delas é esta
  // folga aqui. Com a folga antiga sobravam 4 pixels de menos, e o preço
  // encostava na frase logo abaixo do cartão.
  //
  // É a prateleira presa baixa demais na parede: cabe, mas esmaga o que está
  // embaixo. Agora a folga é maior que o rótulo, com sobra.
  return (
    <div className="px-6 pb-12 pt-10">
      <div className="relative">
        {/* O trilho */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-1000 ease-out motion-reduce:transition-none"
            style={{ width: `${posicao}%` }}
          />
        </div>

        {/* Os marcos */}
        {marcos.map((m) => {
          const Icone = ICONE_DO_NIVEL[m.nivel as 2 | 3 | 4] ?? Zap;
          const concluido = m.estado === "concluido";
          const atual = m.estado === "atual";
          return (
            <div
              key={m.meta}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${m.posicao}%` }}
            >
              <div
                title={`${m.meta} pedidos desbloqueiam ${formatCents(m.precoCents)} por pedido`}
                className={`grid place-items-center rounded-full border-2 transition-colors ${
                  concluido
                    ? "h-7 w-7 border-primary bg-primary text-primary-foreground"
                    : atual
                      ? "h-8 w-8 border-primary bg-background text-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                      : "h-6 w-6 border-border bg-background text-muted-foreground"
                }`}
              >
                {m.estado === "bloqueado" ? (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Icone className={concluido ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
                )}
              </div>

              {/* O rótulo do marco: número em cima, preço embaixo. Não depende
                  de cor para se entender — quem não distingue as cores lê o
                  cadeado e o texto. */}
              <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-center">
                <p
                  className={`text-[11px] font-bold leading-none ${
                    m.estado === "bloqueado" ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {m.meta}
                </p>
                <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">
                  {formatCents(m.precoCents)}
                </p>
              </div>
            </div>
          );
        })}

        {/* O indicador: onde a loja está agora */}
        <div
          className="absolute -top-9 -translate-x-1/2 transition-[left] duration-1000 ease-out motion-reduce:transition-none"
          style={{ left: `${posicao}%` }}
        >
          <div
            // A chave muda a cada pedido novo: isso reinicia a animação de
            // "avanço" sem precisar de temporizador nenhum.
            key={pulso}
            className="flex flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-xl text-primary-foreground shadow-lg motion-safe:animate-[cents-flutua_2.6s_ease-in-out_infinite] ${
                noMaximo ? "bg-gradient-to-br from-amber-400 to-primary" : "bg-primary"
              }`}
            >
              {noMaximo ? (
                <Crown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Zap className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <span
              aria-hidden="true"
              className="-mt-0.5 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

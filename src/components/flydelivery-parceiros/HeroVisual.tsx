import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import hamburguerUrl from "@/assets/flydelivery-parceiros/hero-hamburguer.webp";
import { CelularMarketplace } from "./CelularMarketplace";
import { QuadroDePedidos } from "./QuadroDePedidos";

/**
 * O lado direito do Hero: hambúrguer → Gestão de Pedidos → hambúrguer →
 * Marketplace → hambúrguer, num ciclo de 8 segundos que não tem começo nem
 * fim visível.
 *
 * AS TRÊS CAMADAS
 *
 * Ficam empilhadas na MESMA caixa, de tamanho fixo. Só muda a transparência
 * e a posição de cada uma — nada empurra o resto da página.
 *
 * - Hambúrguer: a mesma imagem que o Hero já mostrava (o primeiro quadro do
 *   vídeo oficial). Ele balança devagar, como um produto girando numa vitrine.
 * - Pedidos: o MESMO quadro de pedidos da seção "Gestão de pedidos".
 * - Marketplace: o celular do aplicativo desenhado com código
 *   (CelularMarketplace) — o que a seção "Marketplace" usava antes de ganhar
 *   a foto do celular.
 * Nada foi redesenhado: são as peças que a página já tinha.
 *
 * QUEM COMANDA O TEMPO
 *
 * O CSS (parceiros.css, seção "HERO — o ciclo"). Cada camada tem uma linha do
 * tempo de 8 s em que o último instante é igual ao primeiro, então a volta
 * emenda sem salto. O balanço do hambúrguer roda numa trilha separada que
 * não para nunca — quando ele reaparece, continua de onde estaria, em vez de
 * recomeçar do zero.
 *
 * O código aqui só faz duas coisas: pausa tudo JUNTO quando o Hero sai da
 * tela (e retoma junto quando volta — as camadas nunca se desencontram) e
 * oferece o botão de pausa para quem navega pelo teclado. Não existe
 * cronômetro, então não há como acumular cronômetros nem esquecer algum
 * ligado ao sair da página.
 *
 * Quem pediu menos movimento no aparelho vê só o hambúrguer, parado.
 */
export function HeroVisual({ className = "" }: { className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [foraDaTela, setForaDaTela] = useState(false);
  const [pausadoPelaPessoa, setPausadoPelaPessoa] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setForaDaTela(!e.isIntersecting), {
      threshold: 0,
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const pausado = foraDaTela || pausadoPelaPessoa;

  return (
    <div className={`relative ${className}`}>
      <div
        ref={caixa}
        className="fdp-heroi relative aspect-[744/640] w-full"
        data-pausado={pausado ? "sim" : "nao"}
        role="img"
        aria-label="Animação: o hambúrguer se transforma no quadro de pedidos do FlyDelivery Parceiros, volta a ser hambúrguer, vira o aplicativo FlyDelivery no celular e volta ao hambúrguer."
      >
        <CamadaHamburguer />
        <CamadaPedidos />
        <CamadaMarketplace />
      </div>

      {/* Só aparece para quem chega pelo teclado (Tab). Quem usa mouse ou
          dedo nunca vê controle sobre a animação. */}
      <button
        type="button"
        onClick={() => setPausadoPelaPessoa((v) => !v)}
        className="fdp-pausa fdp-heroi-pausa inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-md"
        style={{ color: "var(--fdp-texto)" }}
      >
        {pausadoPelaPessoa ? (
          <>
            <Play className="h-4 w-4" aria-hidden /> Retomar animação
          </>
        ) : (
          <>
            <Pause className="h-4 w-4" aria-hidden /> Pausar animação
          </>
        )}
      </button>
    </div>
  );
}

/**
 * O hambúrguer. Três níveis, cada um com um papel:
 * camada (some e volta no ciclo) → balanço (gira devagar, ida e volta) →
 * respiro (flutua e inclina de leve). A borda some em degradê, como antes.
 */
function CamadaHamburguer() {
  return (
    <div aria-hidden="true" className="fdp-heroi-camada fdp-heroi-hamburguer fdp-heroi-anima">
      <div className="fdp-heroi-balanco fdp-heroi-anima h-full w-full">
        <div className="fdp-heroi-respiro fdp-heroi-anima h-full w-full">
          <img
            src={hamburguerUrl}
            alt=""
            width={744}
            height={640}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}

/** A Gestão de Pedidos: o quadro da seção 03, parado (sem a animação interna). */
function CamadaPedidos() {
  return (
    <div aria-hidden="true" className="fdp-heroi-camada fdp-heroi-pedidos fdp-heroi-anima">
      <div className="fdp-heroi-pedidos-quadro">
        <QuadroDePedidos />
      </div>
    </div>
  );
}

/** O Marketplace: o celular desenhado com código (CelularMarketplace). */
function CamadaMarketplace() {
  return (
    <div aria-hidden="true" className="fdp-heroi-camada fdp-heroi-marketplace fdp-heroi-anima">
      <div className="fdp-heroi-celular">
        <CelularMarketplace />
      </div>
    </div>
  );
}

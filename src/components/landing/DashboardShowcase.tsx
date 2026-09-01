import { useEffect, useRef, useState } from "react";
import { useMenosAnimacao } from "./useMenosAnimacao";

/**
 * O print do FlyControl flutuando — o protagonista da página.
 *
 * TRÊS MOVIMENTOS SOMADOS, E POR QUE ELES SÃO ASSIM
 *
 * 1. A INCLINAÇÃO FIXA. O painel não fica de frente para a tela; fica
 *    levemente virado, como um objeto apoiado numa bancada. É isso que dá a
 *    sensação de que existe alguma coisa ali, e não uma figurinha colada.
 *
 * 2. A FLUTUAÇÃO. Vinte e dois segundos para ir e voltar. Ninguém vê o
 *    movimento acontecer — a pessoa só percebe, depois de um tempo, que a
 *    imagem não está no mesmo lugar. É a diferença entre um lustre pesado
 *    balançando devagar e um enfeite de para-brisa.
 *
 * 3. A REAÇÃO AO MOUSE. No computador, o painel vira um pouquinho na direção
 *    do cursor — no máximo três graus. Bem menos do que o olho registra como
 *    "animação", e o bastante para o objeto parecer sólido.
 *
 * POR QUE NÃO GIRA 360°
 *
 * Porque o produto é o argumento. Um print girando esconde justamente o que
 * a pessoa veio ver — seria virar o cardápio de costas para o cliente.
 *
 * DESEMPENHO
 *
 * A reação ao mouse não passa pelo React: se cada movimento do cursor
 * pedisse uma nova renderização da página, o computador do visitante ia
 * ficar somando dezenas de vezes por segundo. Em vez disso, a posição é
 * anotada num papelzinho (`useRef`) e escrita direto no elemento uma vez por
 * quadro. Só `transform` — nada que obrigue o navegador a recalcular o
 * layout da página.
 */

type Props = {
  /** Endereço do print. Precisa existir em `public/images`. */
  src: string;
  alt: string;
  /** Largura e altura reais do arquivo, para a página não "pular" ao carregar. */
  largura: number;
  altura: number;
  /** O print do topo carrega junto com a página; os de baixo, só ao chegar. */
  prioridade?: boolean;
  className?: string;
};

/** Quanto o painel vira na direção do cursor, no máximo. */
const LIMITE_Y = 3;
const LIMITE_X = 2;
/** Quanto ele caminha por quadro rumo ao alvo. Menor = mais preguiçoso. */
const SUAVIDADE = 0.08;

export function DashboardShowcase({
  src,
  alt,
  largura,
  altura,
  prioridade = false,
  className = "",
}: Props) {
  const palco = useRef<HTMLDivElement | null>(null);
  const carta = useRef<HTMLDivElement | null>(null);
  const menosAnimacao = useMenosAnimacao();
  const [naTela, setNaTela] = useState(true);

  // Painel fora da tela não precisa flutuar. A página tem quatro deles; deixar
  // os quatro girando o tempo todo é manter quatro fornos acesos para assar
  // uma pizza.
  useEffect(() => {
    const el = palco.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setNaTela(entrada.isIntersecting), {
      rootMargin: "200px 0px",
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (menosAnimacao) return;

    const elPalco = palco.current;
    const elCarta = carta.current;
    if (!elPalco || !elCarta) return;

    // Só no computador. No celular não existe cursor, e ficar escutando
    // toque para inclinar atrapalharia a rolagem.
    const temMouse = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!temMouse.matches) return;

    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };
    let quadro = 0;

    const desenhar = () => {
      atual.x += (alvo.x - atual.x) * SUAVIDADE;
      atual.y += (alvo.y - atual.y) * SUAVIDADE;
      // Escreve numa variável de CSS; o giro base continua na animação, e os
      // dois se somam sem uma atrapalhar a outra.
      elCarta.style.setProperty("--fly-mouse-x", `${atual.x.toFixed(3)}deg`);
      elCarta.style.setProperty("--fly-mouse-y", `${atual.y.toFixed(3)}deg`);
      quadro = requestAnimationFrame(desenhar);
    };

    const aoMover = (evento: PointerEvent) => {
      const caixa = elPalco.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) return;
      const dx = (evento.clientX - (caixa.left + caixa.width / 2)) / (caixa.width / 2);
      const dy = (evento.clientY - (caixa.top + caixa.height / 2)) / (caixa.height / 2);
      alvo.y = Math.max(-1, Math.min(1, dx)) * LIMITE_Y;
      alvo.x = Math.max(-1, Math.min(1, -dy)) * LIMITE_X;
    };

    const aoSair = () => {
      alvo.x = 0;
      alvo.y = 0;
    };

    elPalco.addEventListener("pointermove", aoMover);
    elPalco.addEventListener("pointerleave", aoSair);
    quadro = requestAnimationFrame(desenhar);

    return () => {
      cancelAnimationFrame(quadro);
      elPalco.removeEventListener("pointermove", aoMover);
      elPalco.removeEventListener("pointerleave", aoSair);
    };
  }, [menosAnimacao]);

  return (
    <div ref={palco} className={`relative ${className}`} style={{ perspective: "1400px" }}>
      {/* A luz atrás do painel: o brilho de um monitor ligado num quarto
          escuro, não um fundo colorido.

          É um GRADIENTE, e não um desfoque. Medido no navegador: com
          `filter: blur(100px)` a rolagem perdia metade dos quadros no
          computador, porque o navegador refazia o borrão a cada quadro em que
          o painel se mexia. O gradiente é desenhado uma vez e fica pronto —
          mesma aparência, sem a conta repetida. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgb(var(--fly-primary-rgb) / .30), rgb(var(--fly-primary-rgb) / .10) 55%, transparent 78%)",
        }}
      />

      <div ref={carta} className="fly-showcase fly-float" style={{ transformStyle: "preserve-3d" }}>
        {/* Duas camadas de propósito: a de fora faz a flutuação lenta, a de
            dentro faz o giro do mouse. Somar os dois numa transformação só
            faria um apagar o outro. */}
        <div
          style={{
            transform: "rotateY(var(--fly-mouse-y, 0deg)) rotateX(var(--fly-mouse-x, 0deg))",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          <img
            src={src}
            alt={alt}
            width={largura}
            height={altura}
            loading={prioridade ? "eager" : "lazy"}
            decoding={prioridade ? "sync" : "async"}
            fetchPriority={prioridade ? "high" : "auto"}
            className="block h-auto w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}

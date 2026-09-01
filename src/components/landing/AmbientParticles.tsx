import { useEffect, useRef } from "react";
import { useMenosAnimacao } from "./useMenosAnimacao";

/**
 * Pontinhos que se movem devagar atrás do Hero.
 *
 * O QUE ELES REPRESENTAM
 *
 * Pedidos entrando, dados circulando, sistemas conversando. Nada de desenho
 * de cérebro nem de forma orgânica: são pontos e, de vez em quando, uma linha
 * ligando dois que passaram perto. É o movimento de uma noite cheia visto de
 * longe.
 *
 * POR QUE É DISCRETO
 *
 * Porque o protagonista é o print do painel. Se os pontinhos chamarem
 * atenção, eles roubaram a cena de quem estava vendendo. São 34 pontos, com
 * opacidade baixa, andando devagar.
 *
 * POR QUE `canvas` E NÃO ELEMENTOS NA PÁGINA
 *
 * Trinta e quatro elementos animados de verdade obrigariam o navegador a
 * recalcular a página o tempo todo. Num quadro só, é um desenho — o mesmo
 * esforço de exibir uma foto. E o `canvas` fica marcado como decoração, então
 * o leitor de tela passa direto: nenhuma informação da página mora aqui.
 */

const QUANTIDADE = 34;
/** Distância máxima, em pixels, para dois pontos serem ligados por uma linha. */
const DISTANCIA_DA_LINHA = 130;

type Ponto = { x: number; y: number; vx: number; vy: number; r: number };

export function AmbientParticles({ className = "" }: { className?: string }) {
  const tela = useRef<HTMLCanvasElement | null>(null);
  const menosAnimacao = useMenosAnimacao();

  useEffect(() => {
    if (menosAnimacao) return;
    const canvas = tela.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Em telas retina desenhar em 1x e esticar deixa o ponto borrado; em 3x
    // gasta o triplo à toa. Dois é o teto.
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    let largura = 0;
    let altura = 0;
    let pontos: Ponto[] = [];
    let quadro = 0;
    let rodando = true;

    const medir = () => {
      const caixa = canvas.getBoundingClientRect();
      largura = caixa.width;
      altura = caixa.height;
      canvas.width = Math.round(largura * escala);
      canvas.height = Math.round(altura * escala);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
    };

    const semear = () => {
      pontos = Array.from({ length: QUANTIDADE }, () => ({
        x: Math.random() * largura,
        y: Math.random() * altura,
        // Devagar de propósito: ~4 a 12 pixels por segundo.
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        r: Math.random() * 1.1 + 0.6,
      }));
    };

    const desenhar = () => {
      if (!rodando) return;
      ctx.clearRect(0, 0, largura, altura);

      for (const p of pontos) {
        p.x += p.vx;
        p.y += p.vy;
        // Sai por um lado, entra pelo outro. Nada nasce nem morre na tela.
        if (p.x < -10) p.x = largura + 10;
        if (p.x > largura + 10) p.x = -10;
        if (p.y < -10) p.y = altura + 10;
        if (p.y > altura + 10) p.y = -10;
      }

      // As linhas primeiro, para os pontos ficarem por cima.
      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const dx = pontos[i].x - pontos[j].x;
          const dy = pontos[i].y - pontos[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist > DISTANCIA_DA_LINHA) continue;
          const forca = 1 - dist / DISTANCIA_DA_LINHA;
          ctx.strokeStyle = `rgba(255,255,255,${(forca * 0.055).toFixed(4)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pontos[i].x, pontos[i].y);
          ctx.lineTo(pontos[j].x, pontos[j].y);
          ctx.stroke();
        }
      }

      for (const [indice, p] of pontos.entries()) {
        // Um em cada seis pontos acende no laranja da marca. É o pedido que
        // entrou no meio dos dados que só passam.
        const laranja = indice % 6 === 0;
        ctx.fillStyle = laranja ? "rgba(255,90,0,.42)" : "rgba(255,255,255,.20)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      quadro = requestAnimationFrame(desenhar);
    };

    medir();
    semear();
    quadro = requestAnimationFrame(desenhar);

    // Aba escondida: desenhar para ninguém só gasta bateria.
    const aoTrocarDeAba = () => {
      if (document.hidden) {
        rodando = false;
        cancelAnimationFrame(quadro);
      } else if (!rodando) {
        rodando = true;
        quadro = requestAnimationFrame(desenhar);
      }
    };

    const observador =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            medir();
            semear();
          })
        : null;
    observador?.observe(canvas);
    document.addEventListener("visibilitychange", aoTrocarDeAba);

    return () => {
      rodando = false;
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      document.removeEventListener("visibilitychange", aoTrocarDeAba);
    };
  }, [menosAnimacao]);

  if (menosAnimacao) return null;

  return (
    <canvas
      ref={tela}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}

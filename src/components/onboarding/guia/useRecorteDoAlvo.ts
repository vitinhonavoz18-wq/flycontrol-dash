import { useEffect, useState } from "react";

/** A área iluminada, em coordenadas da janela. */
export type Recorte = { top: number; left: number; width: number; height: number };

/** Folga em volta do elemento, para ele não ficar colado na borda do escuro. */
const FOLGA = 8;

/**
 * Onde está o elemento marcado com `data-guia="<marca>"`.
 *
 * POR QUE MEDIR SEM PARAR
 *
 * A tela se mexe o tempo todo: a pessoa rola, o teclado do celular sobe, uma
 * imagem carrega e empurra tudo para baixo, o aparelho gira. Se o buraco de
 * luz fosse medido uma vez só, ele ficaria brilhando em cima do lugar onde o
 * campo ESTAVA.
 *
 * É o holofote do teatro que continua apontado para a marca no chão depois
 * que o ator andou.
 */
export function useRecorteDoAlvo(marca: string | undefined): Recorte | null {
  const [recorte, setRecorte] = useState<Recorte | null>(null);

  useEffect(() => {
    if (!marca || typeof window === "undefined") {
      setRecorte(null);
      return;
    }

    let vivo = true;
    let quadro = 0;
    let visto: HTMLElement | null = null;

    const medir = () => {
      if (!vivo) return;
      const el = document.querySelector<HTMLElement>(`[data-guia="${CSS.escape(marca)}"]`);

      if (!el) {
        setRecorte(null);
      } else {
        // Traz o alvo para a vista na primeira vez que ele aparece. Depois
        // não: arrastar a tela para baixo do lojista enquanto ele digita é
        // pior do que deixá-lo rolar sozinho.
        if (el !== visto) {
          visto = el;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        // O recorte é aparado pelas bordas da JANELA.
        //
        // Aparar só o começo (topo e esquerda) e manter a altura cheia é o
        // erro fácil aqui: com o alvo meio fora da tela por cima, o buraco
        // começa em zero com a altura inteira e sobra para baixo, acendendo
        // um pedaço de tela que não é o campo. Medido no navegador: um alvo
        // com o topo em -120px acendia 120px a mais do que devia.
        //
        // É o holofote aberto demais: ilumina o ator e mais dois metros de
        // cenário vazio.
        const r = el.getBoundingClientRect();
        const topo = Math.max(0, r.top - FOLGA);
        const esquerda = Math.max(0, r.left - FOLGA);
        const base = Math.min(window.innerHeight, r.bottom + FOLGA);
        const direita = Math.min(window.innerWidth, r.right + FOLGA);
        setRecorte({
          top: topo,
          left: esquerda,
          width: Math.max(0, direita - esquerda),
          height: Math.max(0, base - topo),
        });
      }
      quadro = requestAnimationFrame(medir);
    };

    quadro = requestAnimationFrame(medir);
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
    };
  }, [marca]);

  return recorte;
}

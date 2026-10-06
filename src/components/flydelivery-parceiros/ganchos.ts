import { useEffect, useRef, useState } from "react";

/**
 * Ajudantes pequenos da página FlyDelivery Parceiros.
 *
 * O nome começa em inglês ("use") porque é assim que o React reconhece um
 * hook — a regra é dele, não nossa.
 */

/**
 * Avisa uma vez só quando o elemento aparece na tela.
 *
 * Usa o observador do próprio navegador, que avisa quando precisa, em vez de
 * ficar medindo a rolagem o tempo todo — é o garçom que olha quando o cliente
 * levanta a mão, e não o que fica rodando o salão sem parar.
 */
export function useNaTela<T extends HTMLElement>(margem = "0px 0px -15% 0px") {
  const alvo = useRef<T | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    // Navegador sem observador: mostra tudo de uma vez. O conteúdo nunca
    // pode depender da animação para aparecer.
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      { rootMargin: margem, threshold: 0.1 },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [margem]);

  return [alvo, visivel] as const;
}

/**
 * `true` só depois de confirmar, no aparelho, que a pessoa NÃO pediu menos
 * movimento.
 *
 * Começa em `false` de propósito: o servidor não sabe a preferência do
 * aparelho. Se começasse em `true`, quem pediu menos movimento veria a
 * animação rodar por um instante antes de parar.
 */
export function useMovimentoPermitido(): boolean {
  const [permitido, setPermitido] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPermitido(!consulta.matches);
    const aoMudar = (e: MediaQueryListEvent) => setPermitido(!e.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  return permitido;
}

/**
 * Ajusta o "chão" da página enquanto ela está aberta, e devolve como estava
 * ao sair.
 *
 * O resto do sistema tem fundo escuro. Sem isto, ao puxar a página além do
 * topo no celular (o "elástico" da rolagem), aparece uma faixa preta atrás da
 * página branca. Também liga a rolagem suave dos links do menu — só aqui,
 * para não mudar o comportamento do painel.
 */
export function useAmbienteDaPagina() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const antes = {
      htmlFundo: html.style.backgroundColor,
      bodyFundo: body.style.background,
      rolagem: html.style.scrollBehavior,
    };

    html.style.backgroundColor = "#ffffff";
    body.style.background = "#ffffff";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      html.style.scrollBehavior = "smooth";
    }

    return () => {
      html.style.backgroundColor = antes.htmlFundo;
      body.style.background = antes.bodyFundo;
      html.style.scrollBehavior = antes.rolagem;
    };
  }, []);
}

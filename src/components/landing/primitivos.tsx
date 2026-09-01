import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Peças pequenas e repetidas da página pública.
 *
 * Ficam juntas de propósito: são cinco componentes de dez linhas cada, e um
 * arquivo por peça deixaria a pasta cheia de arquivos que ninguém abre. As
 * peças grandes (a barra, o print, o fluxo) têm arquivo próprio.
 */

/**
 * Aparece quando entra na tela: sobe um pouco, sai do desfoque, acende.
 *
 * Usa o observador do próprio navegador em vez de ficar escutando a rolagem.
 * A diferença é a mesma entre o garçom olhar para a mesa quando o cliente
 * levanta a mão e o garçom ficar dando voltas no salão o tempo todo: o
 * primeiro não cansa ninguém.
 */
export function Reveal({
  children,
  atraso = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Milissegundos de espera. Serve para escalonar itens de uma lista. */
  atraso?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const alvo = useRef<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;

    // Navegador antigo sem observador: mostra tudo de uma vez. O conteúdo
    // nunca pode depender da animação para existir.
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            setVisivel(true);
            observador.disconnect();
          }
        }
      },
      // Começa um pouco antes de encostar na borda de baixo: quando a pessoa
      // termina de rolar, o bloco já está aceso.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <Tag
      ref={alvo as never}
      className={`fly-reveal ${className}`}
      data-visivel={visivel ? "sim" : "nao"}
      style={{ "--fly-atraso": `${atraso}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** A etiqueta pequena em maiúsculas que abre cada seção. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="fly-label font-medium" style={{ color: "var(--fly-primary)" }}>
      {children}
    </p>
  );
}

/** O título de uma seção: grande, leve, apertado. */
export function SectionHeading({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={`fly-section-title mt-5 ${className}`}
      style={{ color: "var(--fly-text-primary)" }}
    >
      {children}
    </h2>
  );
}

/** O parágrafo de apoio, sempre em cinza e sempre curto. */
export function SectionText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`fly-body mt-6 max-w-md ${className}`}
      style={{ color: "var(--fly-text-secondary)" }}
    >
      {children}
    </p>
  );
}

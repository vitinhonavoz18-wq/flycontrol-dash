import type { ReactNode } from "react";
import { DashboardShowcase } from "./DashboardShowcase";
import { Reveal, SectionHeading, SectionLabel, SectionText } from "./primitivos";

/**
 * Uma seção de produto: texto de um lado, produto do outro.
 *
 * O mesmo molde serve para pedidos, cardápio, financeiro e o resto. Ter um
 * molde só é o que impede a página de virar uma colcha de retalhos onde cada
 * seção foi montada de um jeito.
 *
 * O lado do produto pode receber:
 *
 * - um PRINT REAL (`imagem`), que é sempre a melhor opção; ou
 * - uma composição desenhada (`visual`), quando não existe uma tela que
 *   caiba bem num retângulo — como o caminho de um pedido entre etapas.
 *
 * O que ele nunca recebe é um dashboard inventado. Desenhar uma tela que o
 * sistema não tem é vender o que não existe.
 */

type Props = {
  id?: string;
  etiqueta: string;
  titulo: ReactNode;
  texto: string;
  /** Itens curtos abaixo do texto. Cada um precisa existir no produto. */
  pontos?: readonly string[];
  imagem?: { src: string; alt: string; largura: number; altura: number };
  visual?: ReactNode;
  /** Inverte os lados no computador, para a página não virar um trilho só. */
  espelhado?: boolean;
};

export function ProductShowcase({
  id,
  etiqueta,
  titulo,
  texto,
  pontos,
  imagem,
  visual,
  espelhado = false,
}: Props) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-titulo` : undefined}
      className="border-t px-5 py-24 sm:px-8 md:py-32"
      style={{ borderColor: "var(--fly-border-subtle)" }}
    >
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal className={espelhado ? "lg:order-2" : ""}>
          <SectionLabel>{etiqueta}</SectionLabel>
          <SectionHeading id={id ? `${id}-titulo` : undefined}>{titulo}</SectionHeading>
          <SectionText>{texto}</SectionText>

          {pontos && pontos.length > 0 && (
            <ul className="mt-9 space-y-3">
              {pontos.map((ponto) => (
                <li key={ponto} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[9px] h-1 w-1 shrink-0 rounded-full"
                    style={{ background: "var(--fly-primary)" }}
                  />
                  <span className="text-[16px]" style={{ color: "var(--fly-text-secondary)" }}>
                    {ponto}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Reveal>

        <Reveal atraso={120} className={espelhado ? "lg:order-1" : ""}>
          {imagem ? (
            <DashboardShowcase
              src={imagem.src}
              alt={imagem.alt}
              largura={imagem.largura}
              altura={imagem.altura}
            />
          ) : (
            visual
          )}
        </Reveal>
      </div>
    </section>
  );
}

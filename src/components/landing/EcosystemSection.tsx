import { Fragment } from "react";
import { Reveal, SectionHeading, SectionLabel, SectionText } from "./primitivos";

/**
 * Os três sistemas e como eles se encaixam.
 *
 * SiteCreatorFly → FlyControl → FlyDelivery
 *
 * A leitura é de cima para baixo (ou da esquerda para a direita, no
 * computador) porque essa é a ordem real das coisas: o pedido nasce no site,
 * passa pelo painel e vira entrega. Não é um diagrama de arquitetura — é o
 * caminho que o pedido faz.
 *
 * O FlyControl fica no meio, e é o único com a borda acesa. Não é enfeite:
 * ele é o centro, e o desenho precisa dizer isso sem escrever "somos o
 * centro".
 */

type Peca = { nome: string; papel: string; texto: string; centro?: boolean };

const PECAS: readonly Peca[] = [
  {
    nome: "SiteCreatorFly",
    papel: "A vitrine",
    texto: "O site de pedidos da sua loja: cardápio, carrinho, checkout e o pedido nascendo.",
  },
  {
    nome: "FlyControl",
    papel: "O centro",
    texto: "Onde o pedido chega, a operação acontece e o resultado aparece.",
    centro: true,
  },
  {
    nome: "FlyDelivery",
    papel: "A saída",
    texto: "O que acontece depois que o pedido sai da cozinha.",
  },
] as const;

export function EcosystemSection() {
  return (
    <section
      id="ecossistema"
      aria-labelledby="ecossistema-titulo"
      className="border-t px-5 py-24 sm:px-8 md:py-32"
      style={{ borderColor: "var(--fly-border-subtle)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal className="max-w-2xl">
          <SectionLabel>Ecossistema</SectionLabel>
          <SectionHeading id="ecossistema-titulo">Tudo conectado.</SectionHeading>
          <SectionText className="max-w-lg">
            Da presença digital à operação. Do primeiro pedido à gestão completa.
          </SectionText>
        </Reveal>

        <ol className="mt-16 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0">
          {PECAS.map((peca, indice) => (
            <Fragment key={peca.nome}>
              <Reveal as="li" atraso={indice * 140} className="h-full">
                <div
                  className="flex h-full flex-col rounded-[var(--fly-radius-lg)] p-8"
                  style={{
                    background: peca.centro ? "var(--fly-surface-02)" : "var(--fly-surface-01)",
                    border: `1px solid ${peca.centro ? "rgb(var(--fly-primary-rgb) / .32)" : "var(--fly-border-subtle)"}`,
                    boxShadow: peca.centro ? "0 0 70px var(--fly-primary-glow)" : "none",
                  }}
                >
                  <span
                    className="fly-label"
                    style={{ color: peca.centro ? "var(--fly-primary)" : "var(--fly-text-muted)" }}
                  >
                    {peca.papel}
                  </span>
                  <h3
                    className="mt-4 text-[26px] tracking-[-0.03em]"
                    style={{ color: "var(--fly-text-primary)" }}
                  >
                    {peca.nome}
                  </h3>
                  <p
                    className="mt-3 text-[15px] leading-[1.55]"
                    style={{ color: "var(--fly-text-secondary)" }}
                  >
                    {peca.texto}
                  </p>
                </div>
              </Reveal>

              {/* A ligação entre um bloco e o outro. É decoração: quem usa
                  leitor de tela já lê a ordem da lista. */}
              {indice < PECAS.length - 1 && (
                <div aria-hidden="true" className="flex items-center justify-center py-1 lg:px-6">
                  <span
                    className="h-px w-10 lg:w-14"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgb(var(--fly-primary-rgb) / .55), transparent)",
                    }}
                  />
                </div>
              )}
            </Fragment>
          ))}
        </ol>
      </div>
    </section>
  );
}

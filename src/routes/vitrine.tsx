import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BotaoWhatsApp } from "@/components/landing/BotaoWhatsApp";
import { Navbar } from "@/components/landing/Navbar";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Reveal, SectionLabel } from "@/components/landing/primitivos";
import { CardDemonstracao } from "@/components/vitrine/CardDemonstracao";
import { DemonstracaoAmpliada } from "@/components/vitrine/DemonstracaoAmpliada";
import { suspenderVitrine } from "@/components/vitrine/useVideoNaTela";
import { BRAND } from "@/lib/brand";
import {
  categorias,
  demonstracoesPublicas,
  mostrarFiltros,
  type DemonstracaoPublica,
} from "@/lib/vitrine/demonstracoes";

export const Route = createFileRoute("/vitrine")({
  component: VitrinePage,
  head: () => ({
    meta: [
      { title: `Vitrine de Cardápios — ${BRAND.name}` },
      {
        name: "description",
        content:
          "Cardápios digitais reais funcionando: veja como estabelecimentos que usam o FlyDelivery recebem pedidos.",
      },
    ],
  }),
});

/**
 * VITRINE DE CARDÁPIOS
 *
 * A página que mostra, em vídeo, cardápios reais feitos com o FlyDelivery
 * funcionando: a capa da loja, a rolagem pelo cardápio, um produto entrando
 * no carrinho e o resumo do pedido. Quem é dono de pizzaria ou hamburgueria
 * entende em dez segundos o que vai receber — sem precisar imaginar a partir
 * de um print.
 *
 * DE ONDE VÊM OS CARDS: `src/lib/vitrine/demonstracoes.json`, preenchido
 * pelo gerador `scripts/vitrine/gerar-demonstracoes.mjs`. Só aparece o que
 * está marcado como `publicar: true` — loja nova não vai para a vitrine sem
 * aprovação.
 *
 * DESEMPENHO: a página abre só com fotos. Cada vídeo só baixa quando chega
 * perto da tela, e só um toca por vez (`useVideoNaTela`).
 */
function VitrinePage() {
  const todas = useMemo(() => demonstracoesPublicas(), []);
  const lista = useMemo(() => categorias(todas), [todas]);
  const comFiltro = mostrarFiltros(todas);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<DemonstracaoPublica | null>(null);
  const visiveis = filtro ? todas.filter((d) => d.categoria === filtro) : todas;

  useEffect(() => {
    suspenderVitrine(!!ampliada);
  }, [ampliada]);

  return (
    <div
      className="font-fly"
      style={{ background: "var(--fly-background)", color: "var(--fly-text-primary)" }}
    >
      <Navbar />

      <main id="topo">
        {/* sentinela da barra do topo (ela escurece quando a pessoa rola) */}
        <span id="fly-topo" aria-hidden="true" className="absolute left-0 top-0 h-1 w-1" />

        <section aria-labelledby="vitrine-titulo" className="px-5 pb-10 pt-32 sm:px-8 sm:pt-40">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="max-w-3xl">
              <SectionLabel>Vitrine de Cardápios</SectionLabel>
              <h1 id="vitrine-titulo" className="fly-headline mt-5">
                Seu próximo cardápio
                <br />
                pode ser <span style={{ color: "var(--fly-primary)" }}>assim.</span>
              </h1>
              <p
                className="fly-body-lg mt-7 max-w-2xl"
                style={{ color: "var(--fly-text-secondary)" }}
              >
                Conheça experiências digitais criadas para transformar visitantes em pedidos e
                modernizar o atendimento do seu delivery.
              </p>
              {todas.length > 0 && (
                <p className="mt-4 text-[14px]" style={{ color: "var(--fly-text-muted)" }}>
                  {todas.length} cardápios reais em funcionamento · gravados direto do site de cada
                  loja
                </p>
              )}
            </Reveal>
          </div>
        </section>

        <section aria-label="Demonstrações" className="px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-[1240px]">
            {comFiltro && (
              <div
                role="group"
                aria-label="Filtrar por categoria"
                className="mb-8 flex flex-wrap gap-2"
              >
                <BotaoFiltro ativo={filtro === null} onClick={() => setFiltro(null)}>
                  Todos <span className="opacity-60">{todas.length}</span>
                </BotaoFiltro>
                {lista.map((c) => (
                  <BotaoFiltro
                    key={c.nome}
                    ativo={filtro === c.nome}
                    onClick={() => setFiltro(c.nome)}
                  >
                    {c.nome} <span className="opacity-60">{c.total}</span>
                  </BotaoFiltro>
                ))}
              </div>
            )}

            {visiveis.length === 0 ? (
              <div className="fly-surface mx-auto max-w-xl px-6 py-14 text-center">
                <p className="fly-subheading">As demonstrações estão a caminho</p>
                <p className="fly-body mt-3" style={{ color: "var(--fly-text-secondary)" }}>
                  Estamos gravando os cardápios dos nossos clientes. Enquanto isso, fale com a gente
                  e veja um cardápio ao vivo.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visiveis.map((demo, i) => (
                  <Reveal as="li" key={demo.slug} atraso={(i % 4) * 70}>
                    <CardDemonstracao demo={demo} onAmpliar={setAmpliada} />
                  </Reveal>
                ))}
              </ul>
            )}

            <p className="mt-8 text-[13px]" style={{ color: "var(--fly-text-muted)" }}>
              Vídeos gravados automaticamente nos sites públicos das lojas. Nenhum pedido real foi
              feito nas gravações.
            </p>
          </div>
        </section>

        <ChamadaVitrine />
      </main>

      <SiteFooter />
      <BotaoWhatsApp />
      <DemonstracaoAmpliada demo={ampliada} onFechar={() => setAmpliada(null)} />
    </div>
  );
}

function BotaoFiltro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="rounded-full px-4 py-2 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={
        ativo
          ? {
              background: "var(--fly-text-primary)",
              color: "var(--fly-background)",
              outlineColor: "var(--fly-primary)",
            }
          : {
              border: "1px solid var(--fly-border-strong)",
              color: "var(--fly-text-secondary)",
              outlineColor: "var(--fly-primary)",
            }
      }
    >
      {children}
    </button>
  );
}

/** A chamada final: o mesmo preto/azul-noturno que fecha a página inicial. */
function ChamadaVitrine() {
  return (
    <section
      aria-labelledby="vitrine-final"
      className="fly-escuro px-5 py-24 sm:px-8 sm:py-32"
      style={{ background: "var(--fly-background)" }}
    >
      <Reveal className="mx-auto max-w-[1000px] text-center">
        <h2
          id="vitrine-final"
          className="fly-headline"
          style={{ color: "var(--fly-text-primary)" }}
        >
          Gostou do que viu?
          <br />
          <span style={{ color: "var(--fly-primary)" }}>O próximo pode ser o seu.</span>
        </h2>
        <p
          className="fly-body-lg mx-auto mt-7 max-w-2xl"
          style={{ color: "var(--fly-text-secondary)" }}
        >
          Tenha um cardápio digital profissional, organizado e preparado para receber pedidos. Faça
          seu delivery evoluir com o FlyDelivery.
        </p>
        <div className="mt-11">
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="inline-flex items-center rounded-full px-8 py-4 text-[16px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--fly-primary)",
              color: "var(--fly-on-primary)",
              outlineColor: "var(--fly-primary)",
            }}
          >
            Quero meu cardápio digital
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

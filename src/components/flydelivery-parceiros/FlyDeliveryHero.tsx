import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";
import { HeroVideo } from "./HeroVideo";

/**
 * A primeira tela.
 *
 * No computador: texto à esquerda, animação à direita. No celular, na ordem
 * em que a pessoa lê: título, frase, botões — e a animação logo abaixo, em
 * tamanho cheio, sem espremer.
 *
 * O título é texto de verdade (não está dentro do vídeo). Isso garante que
 * ele aparece primeiro, mesmo com internet lenta, e que o Google e o leitor
 * de tela conseguem lê-lo.
 */
export function FlyDeliveryHero() {
  return (
    <section
      id="topo"
      aria-labelledby="fdp-hero-titulo"
      className="relative isolate pb-14 pt-24 sm:pt-28 lg:pb-20 lg:pt-32"
    >
      {/* Ponto invisível: quando ele sai da tela, a barra do topo ganha fundo. */}
      <span id="fdp-sentinela" aria-hidden="true" className="absolute left-0 top-0 h-px w-px" />

      <div aria-hidden="true" className="fdp-hero-fundo fdp-parallax" />

      <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-4">
        <div className="relative z-10">
          <p className="fdp-rotulo">Para restaurantes e deliveries</p>

          <h1 id="fdp-hero-titulo" className="fdp-titulo-hero mt-5">
            <span className="block">Seu delivery</span>
            <span className="block">começa no</span>
            <span className="fdp-desejo block">desejo.</span>
          </h1>

          <p className="fdp-texto-lg mt-6 max-w-[30rem]">
            Do apetite ao pedido, tudo conectado em uma experiência única.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              search={{ plan: undefined, google: undefined }}
              className="fdp-btn fdp-btn-primario"
            >
              Começar grátis
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
            </Link>
            <a href="#como-funciona" className="fdp-btn fdp-btn-secundario">
              Conhecer plataforma
            </a>
          </div>

          <p className="mt-5 text-sm" style={{ color: "var(--fdp-texto-3)" }}>
            {TRIAL_DURATION_DAYS} dias grátis · Implementação gratuita
          </p>
        </div>

        {/* No celular o vídeo encosta nas bordas da tela: as pontas já somem
            em degradê, então ele "sangra" para fora em vez de virar uma caixa
            pequena no meio. */}
        <HeroVideo className="-mx-5 sm:mx-auto sm:w-full sm:max-w-[640px] lg:max-w-none lg:-mr-6 xl:-mr-12" />
      </div>
    </section>
  );
}

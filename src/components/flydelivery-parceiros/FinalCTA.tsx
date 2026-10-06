import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/landing/primitivos";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";
import simbolo from "@/assets/flydelivery-parceiros/fly-delivery-simbolo.webp";
import { LinkDoSistema } from "./LinkDoSistema";

/**
 * Seção 08 — o último convite.
 *
 * Um bloco azul-marinho com o brilho laranja, uma pergunta, uma frase e os
 * dois botões. Nada de contagem regressiva nem "últimas vagas": o motivo para
 * clicar tem que ser o produto, não a pressa.
 */
export function FinalCTA() {
  return (
    <section
      id="parceiros"
      aria-labelledby="fdp-final-titulo"
      className="px-4 pb-20 pt-4 sm:px-8 md:pb-28"
    >
      <Reveal className="mx-auto max-w-[1240px]">
        <div
          className="relative isolate overflow-hidden px-6 py-16 text-center sm:px-12 md:py-24"
          style={{ background: "var(--fdp-marinho)", borderRadius: "var(--fdp-raio-lg)" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(55% 70% at 50% 115%, rgb(255 90 0 / 0.55), transparent 70%), radial-gradient(35% 45% at 100% 0%, rgb(255 138 61 / 0.18), transparent 70%)",
            }}
          />
          {/* O símbolo grande e apagado no fundo, como marca d'água. */}
          <img
            src={simbolo}
            alt=""
            aria-hidden="true"
            width={238}
            height={96}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute -right-10 top-8 -z-10 w-[280px] opacity-[0.07] sm:w-[380px]"
          />

          <h2
            id="fdp-final-titulo"
            className="fdp-titulo-secao mx-auto max-w-3xl"
            style={{ color: "#fff" }}
          >
            Seu delivery está pronto para evoluir?
          </h2>
          <p
            className="fdp-texto-lg mx-auto mt-5 max-w-xl"
            style={{ color: "rgb(255 255 255 / 0.75)" }}
          >
            Comece agora com FlyDelivery Parceiros.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkDoSistema para="/signup" className="fdp-btn fdp-btn-primario">
              Começar grátis
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
            </LinkDoSistema>
            <a href="#como-funciona" className="fdp-btn fdp-btn-claro">
              Conhecer plataforma
            </a>
          </div>

          <p className="mt-6 text-sm" style={{ color: "rgb(255 255 255 / 0.6)" }}>
            {TRIAL_DURATION_DAYS} dias grátis · Implementação gratuita
          </p>
        </div>
      </Reveal>
    </section>
  );
}

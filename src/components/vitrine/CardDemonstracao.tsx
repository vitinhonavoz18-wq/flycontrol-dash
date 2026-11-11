import { ArrowUpRight, Expand, Pause, Play, VideoOff } from "lucide-react";
import { linkWhatsAppSuporte } from "@/lib/landing/contato";
import type { DemonstracaoPublica } from "@/lib/vitrine/demonstracoes";
import { useVideoNaTela } from "./useVideoNaTela";

/**
 * Um card da vitrine: o vídeo do cardápio funcionando é o protagonista;
 * embaixo, quem é a loja e dois botões — ver o cardápio de verdade, ou pedir
 * um igual.
 *
 * O espaço do vídeo é reservado desde o primeiro desenho (proporção 9:16),
 * então a página não "pula" quando o vídeo chega.
 */
export function CardDemonstracao({
  demo,
  onAmpliar,
}: {
  demo: DemonstracaoPublica;
  onAmpliar: (demo: DemonstracaoPublica) => void;
}) {
  const { videoRef, caixaRef, estado, autoplay, alternar } = useVideoNaTela(demo.video);
  const tocando = estado === "tocando";
  const falhou = estado === "erro";

  return (
    <article
      className="group fly-vitrine-card flex flex-col overflow-hidden"
      aria-labelledby={`vitrine-${demo.slug}`}
    >
      <div
        ref={caixaRef}
        className="relative overflow-hidden"
        style={{ aspectRatio: "9 / 16", background: demo.cor }}
      >
        <img
          src={demo.video.poster}
          alt={`Capa do cardápio de ${demo.nome}`}
          loading="lazy"
          decoding="async"
          width={demo.video.largura}
          height={demo.video.altura}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          aria-label={`Demonstração do cardápio de ${demo.nome}`}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          style={{ opacity: tocando || estado === "pausado" ? 1 : 0 }}
        />

        {/* película no rodapé do vídeo para os botões serem legíveis sobre qualquer cardápio */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{ background: "linear-gradient(to top, rgba(16,24,40,.55), transparent)" }}
        />

        {estado === "carregando" && (
          <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden" aria-hidden>
            <div
              className="fly-vitrine-carregando h-full w-1/3"
              style={{ background: "var(--fly-primary)" }}
            />
          </div>
        )}

        {falhou ? (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white">
            <VideoOff className="h-3.5 w-3.5" aria-hidden /> Prévia indisponível
          </div>
        ) : (
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={alternar}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: "var(--fly-primary)" }}
              aria-label={
                tocando
                  ? `Pausar a demonstração de ${demo.nome}`
                  : `Tocar a demonstração de ${demo.nome}`
              }
            >
              {tocando ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onAmpliar(demo)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: "var(--fly-primary)" }}
              aria-label={`Ampliar a demonstração de ${demo.nome}`}
            >
              <Expand className="h-4 w-4" />
            </button>
          </div>
        )}

        {!autoplay && !tocando && !falhou && (
          <button
            type="button"
            onClick={alternar}
            className="absolute inset-0 grid place-items-center"
            aria-label={`Tocar a demonstração de ${demo.nome}`}
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white">
              <Play className="h-6 w-6 translate-x-[2px]" />
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {demo.logo ? (
            <img
              src={demo.logo}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              className="h-11 w-11 shrink-0 rounded-full object-cover"
              style={{ border: "1px solid var(--fly-border-subtle)" }}
            />
          ) : (
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
              style={{ background: demo.cor }}
              aria-hidden
            >
              {demo.nome.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <h3
              id={`vitrine-${demo.slug}`}
              className="truncate text-[17px] font-semibold tracking-[-0.01em]"
            >
              {demo.nome}
            </h3>
            <p
              className="flex items-center gap-1.5 truncate text-[13px]"
              style={{ color: "var(--fly-text-muted)" }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: demo.cor }}
                aria-hidden
              />
              {[demo.categoria, demo.cidade].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-auto grid gap-2">
          <a
            href={demo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--fly-text-primary)",
              color: "var(--fly-background)",
              outlineColor: "var(--fly-primary)",
            }}
            aria-label={`Ver o cardápio de ${demo.nome} (abre em nova aba)`}
          >
            Ver cardápio <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={linkWhatsAppSuporte(
              `Olá! Vi o cardápio de ${demo.nome} na Vitrine do FlyDelivery e quero um cardápio digital assim para o meu negócio.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-4 py-2.5 text-center text-[14px] font-medium transition-colors hover:bg-[color:var(--fly-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              border: "1px solid var(--fly-border-strong)",
              color: "var(--fly-text-primary)",
              outlineColor: "var(--fly-primary)",
            }}
          >
            Quero um cardápio assim
          </a>
        </div>
      </div>
    </article>
  );
}

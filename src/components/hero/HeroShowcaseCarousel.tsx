import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ShowcaseSlide {
  type: "image" | "video";
  src: string;
  restaurant: string;
}

// Prints e gravações reais de cardápios publicados na plataforma.
const SLIDES: ShowcaseSlide[] = [
  { type: "image", src: "/hero-media/alpha-pastelaria.webp", restaurant: "Alpha Pastelária" },
  { type: "video", src: "/hero-media/mr-pizza-1.mp4", restaurant: "Mr. Pizza" },
  { type: "image", src: "/hero-media/hs-boteco-img.webp", restaurant: "HS Boteco" },
  { type: "video", src: "/hero-media/cheirosa-pizzaria.mp4", restaurant: "Cheirosa Pizzaria" },
  { type: "image", src: "/hero-media/emily-burguer-desktop.webp", restaurant: "Emily Burguer" },
  { type: "video", src: "/hero-media/pizza-paradiso.mp4", restaurant: "Pizza Paradiso" },
  { type: "image", src: "/hero-media/emily-burguer-mobile.webp", restaurant: "Emily Burguer" },
  { type: "video", src: "/hero-media/mr-pizza-2.mp4", restaurant: "Mr. Pizza" },
  { type: "video", src: "/hero-media/hs-boteco.mp4", restaurant: "HS Boteco" },
];

const IMAGE_DISPLAY_MS = 4500;

/**
 * HeroShowcaseCarousel — vitrine de cardápios reais no Hero da landing page.
 *
 * Alterna automaticamente entre imagens (tempo fixo + Ken Burns) e vídeos
 * (avança no `ended` do próprio clipe), com crossfade contínuo entre slides.
 */
export const HeroShowcaseCarousel = memo(function HeroShowcaseCarousel() {
  const [index, setIndex] = useState(0);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    const slide = SLIDES[index];

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Garante que nenhum outro vídeo continue tocando fora de tela.
    videoRefs.current.forEach((video, i) => {
      if (video && i !== index) {
        video.pause();
      }
    });

    if (slide.type === "image") {
      timerRef.current = setTimeout(goNext, IMAGE_DISPLAY_MS);
    } else {
      const video = videoRefs.current[index];
      if (video) {
        // Trocar só o atributo `preload` não faz o navegador (re)carregar o
        // vídeo — precisa de `load()` explícito antes de tocar.
        video.load();
        video.currentTime = 0;
        video.play().catch(() => {
          // Autoplay bloqueado pelo navegador — avança por tempo pra não travar o carrossel.
          timerRef.current = setTimeout(goNext, IMAGE_DISPLAY_MS);
        });
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, goNext]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10">
      {SLIDES.map((slide, i) => {
        const isActive = i === index;
        return (
          <div
            key={slide.src}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 ease-in-out",
              isActive ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!isActive}
          >
            {slide.type === "image" ? (
              <img
                src={slide.src}
                alt={`Cardápio digital da ${slide.restaurant}, criado no FlyControl`}
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                className={cn(
                  "h-full w-full select-none object-cover",
                  isActive && "animate-hero-kenburns",
                )}
              />
            ) : (
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={slide.src}
                muted
                playsInline
                preload={isActive ? "auto" : "metadata"}
                onEnded={goNext}
                className="h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          </div>
        );
      })}

      {/* Indicadores de slide */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.src}
            className={cn(
              "h-1.5 rounded-full bg-white/40 transition-all duration-300",
              i === index ? "w-6 bg-white" : "w-1.5",
            )}
          />
        ))}
      </div>

      <style>{`
        @keyframes hero-kenburns {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        .animate-hero-kenburns {
          animation: hero-kenburns ${IMAGE_DISPLAY_MS}ms ease-out forwards;
        }
      `}</style>
    </div>
  );
});

import { useMouseParallax } from "./HeroMouseParallax";
import { HeroBackground } from "./HeroBackground";
import { HeroContent } from "./HeroContent";
import { HeroShowcaseCarousel } from "./HeroShowcaseCarousel";

/**
 * Hero — full-viewport premium landing experience.
 *
 * Architecture:
 *   Hero
 *   ├── HeroBackground
 *   │   ├── HeroCarousel        (infinite mosaic of real restaurant cards)
 *   │   │   └── HeroCard        (individual card w/ hover preview)
 *   │   └── HeroOverlay         (dark gradient mask)
 *   ├── HeroContent             (glass panel: logo, headline, CTAs, stats)
 *   │   ├── HeroButtons
 *   │   └── HeroStats
 *   └── HeroShowcaseCarousel    (strip below: real cardápios, image/video crossfade)
 */
export function Hero() {
  const mouse = useMouseParallax();

  return (
    <section
      className="relative overflow-hidden"
      aria-label="FlyControl — sistema de gestão para restaurantes"
    >
      <div className="relative min-h-screen">
        {/* Layer 0: animated background mosaic */}
        <HeroBackground mouseX={mouse.x} mouseY={mouse.y} />

        {/* Layer 1: foreground content */}
        <HeroContent />
      </div>

      {/* Vitrine de cardápios reais, abaixo do conteúdo principal */}
      <div className="relative z-20 bg-[#040406] px-6 pb-20 pt-4 sm:pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Cardápios reais, criados na plataforma
            </span>
          </div>
          <div className="h-[320px] w-full sm:h-[420px] lg:h-[520px]">
            <HeroShowcaseCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}

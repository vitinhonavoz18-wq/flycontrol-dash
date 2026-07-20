import { useMouseParallax } from "./HeroMouseParallax";
import { HeroBackground } from "./HeroBackground";
import { HeroContent } from "./HeroContent";

/**
 * Hero — full-viewport premium landing experience.
 *
 * Architecture:
 *   Hero
 *   ├── HeroBackground
 *   │   ├── HeroCarousel  (infinite mosaic of real restaurant cards)
 *   │   │   └── HeroCard  (individual card w/ hover preview)
 *   │   └── HeroOverlay   (dark gradient mask)
 *   └── HeroContent       (glass panel: logo, headline, CTAs, stats)
 *       ├── HeroButtons
 *       └── HeroStats
 */
export function Hero() {
  const mouse = useMouseParallax();

  return (
    <section
      className="relative min-h-screen overflow-hidden"
      aria-label="FlyControl — sistema de gestão para restaurantes"
    >
      {/* Layer 0: animated background mosaic */}
      <HeroBackground mouseX={mouse.x} mouseY={mouse.y} />

      {/* Layer 1: foreground content */}
      <HeroContent />
    </section>
  );
}

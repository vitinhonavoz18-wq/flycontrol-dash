import { useRef, useEffect, useMemo, memo } from "react";
import { HeroCard, type PizzeriaCard } from "./HeroCard";

interface HeroCarouselProps {
  pizzerias: PizzeriaCard[];
  mouseX: number;
  mouseY: number;
}

type CardConfig = {
  pizzeria: PizzeriaCard;
  size: "sm" | "md" | "lg";
  rotation: number;
  layer: 0 | 1 | 2;
  top: number;
};

// Deterministic seeded random so layout is stable across renders
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const SIZES: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
const LAYERS: Array<0 | 1 | 2> = [0, 1, 2];

function buildRows(pizzerias: PizzeriaCard[]): CardConfig[][] {
  if (pizzerias.length === 0) return [];
  const rand = seededRand(42);
  const rows: CardConfig[][] = [];
  const rowCount = 4;

  for (let r = 0; r < rowCount; r++) {
    const row: CardConfig[] = [];
    // Each row cycles through ALL pizzerias to ensure infinite loop
    const items = [...pizzerias, ...pizzerias];
    items.forEach((p, i) => {
      const sizeIdx = Math.floor(rand() * 3);
      const layerIdx = Math.floor(rand() * 3);
      const rotation = (rand() - 0.5) * 6; // -3 to +3 degrees
      const top = rand() * 20 - 10; // slight vertical offset per card
      row.push({
        pizzeria: p,
        size: SIZES[sizeIdx],
        layer: LAYERS[layerIdx],
        rotation,
        top,
      });
    });
    rows.push(row);
  }
  return rows;
}

// Per-row animation speeds (layer 0 = slowest/most distant)
const ROW_SPEEDS = [18, 28, 22, 32]; // seconds for full cycle — very slow

export const HeroCarousel = memo(function HeroCarousel({
  pizzerias,
  mouseX,
  mouseY,
}: HeroCarouselProps) {
  const rows = useMemo(() => buildRows(pizzerias), [pizzerias]);

  if (pizzerias.length === 0) return <HeroCarouselSkeleton />;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {rows.map((row, rowIndex) => (
        <CarouselRow
          key={rowIndex}
          row={row}
          rowIndex={rowIndex}
          speed={ROW_SPEEDS[rowIndex % ROW_SPEEDS.length]}
          mouseX={mouseX}
          mouseY={mouseY}
          totalRows={rows.length}
        />
      ))}
    </div>
  );
});

interface CarouselRowProps {
  row: CardConfig[];
  rowIndex: number;
  speed: number;
  mouseX: number;
  mouseY: number;
  totalRows: number;
}

function CarouselRow({ row, rowIndex, speed, mouseX, mouseY, totalRows }: CarouselRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Direction alternates per row
  const direction = rowIndex % 2 === 0 ? 1 : -1;

  // Parallax layer depth based on rowIndex
  const depth = rowIndex / (totalRows - 1); // 0 = top row, 1 = bottom row
  const parallaxX = mouseX * (depth * 18 - 9);
  const parallaxY = mouseY * (depth * 10 - 5);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Pixel per second: totalWidth / speed
    const pixelsPerSecond = track.scrollWidth / 2 / speed;

    const animate = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      posRef.current += pixelsPerSecond * delta * direction;

      const halfWidth = track.scrollWidth / 2;
      // Loop seamlessly
      if (direction > 0 && posRef.current >= halfWidth) posRef.current -= halfWidth;
      if (direction < 0 && posRef.current <= -halfWidth) posRef.current += halfWidth;

      track.style.transform = `translateX(${-posRef.current}px)`;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [direction, speed]);

  const rowTop = (rowIndex / totalRows) * 100;

  return (
    <div
      className="absolute w-full"
      style={{
        top: `${rowTop}%`,
        transform: `translate(${parallaxX}px, ${parallaxY}px)`,
        transition: "transform 0.1s linear",
        willChange: "transform",
      }}
    >
      <div
        ref={trackRef}
        className="flex gap-3 py-2"
        style={{ willChange: "transform", width: "max-content" }}
      >
        {/* Duplicate the row twice for seamless loop */}
        {[...row, ...row].map((card, i) => (
          <div
            key={`${card.pizzeria.id}-${i}`}
            style={{ marginTop: card.top }}
          >
            <HeroCard
              pizzeria={card.pizzeria}
              size={card.size}
              rotation={card.rotation}
              layer={card.layer}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCarouselSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="absolute flex gap-3"
          style={{ top: `${row * 25}%`, left: 0, right: 0 }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 flex-shrink-0 animate-pulse rounded-xl bg-white/5"
              style={{ width: [140, 180, 220, 160, 200, 150, 190, 170][i] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

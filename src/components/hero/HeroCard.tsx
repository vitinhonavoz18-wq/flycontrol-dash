import { useState, memo } from "react";
import { ExternalLink, MapPin, Store } from "lucide-react";

export interface PizzeriaCard {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  neighborhood: string | null;
  address: string | null;
  public_url: string | null;
  primary_color: string | null;
}

interface HeroCardProps {
  pizzeria: PizzeriaCard;
  size: "sm" | "md" | "lg";
  rotation: number;
  layer: 0 | 1 | 2;
}

const SIZE_MAP = {
  sm: { w: 140, h: 100 },
  md: { w: 180, h: 130 },
  lg: { w: 220, h: 160 },
};

const LAYER_STYLES: Record<number, string> = {
  0: "opacity-25 blur-[2px] scale-90",
  1: "opacity-50 blur-[0.5px] scale-95",
  2: "opacity-80 scale-100",
};

export const HeroCard = memo(function HeroCard({
  pizzeria,
  size,
  rotation,
  layer,
}: HeroCardProps) {
  const [hovered, setHovered] = useState(false);
  const { w, h } = SIZE_MAP[size];
  const accent = pizzeria.primary_color || "#ff5a00";
  const city = pizzeria.neighborhood || pizzeria.address?.split(",")[1]?.trim() || "Brasil";
  const publicUrl = pizzeria.public_url || `https://conectfly.com/${pizzeria.slug}`;

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer transition-all duration-500 will-change-transform"
      style={{
        width: w,
        height: h,
        transform: `rotate(${rotation}deg) scale(${hovered ? 1.08 : 1})`,
        zIndex: hovered ? 50 : layer,
        filter: hovered ? "none" : undefined,
        opacity: hovered ? 1 : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Cardápio de ${pizzeria.name} em ${city}`}
    >
      {/* Card base */}
      <div
        className={`h-full w-full overflow-hidden rounded-xl border transition-all duration-500 ${
          hovered
            ? "border-white/40 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8)]"
            : "border-white/10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]"
        } ${LAYER_STYLES[layer]}`}
        style={{
          background: `linear-gradient(135deg, ${accent}22 0%, #0a0a0a 60%)`,
          backdropFilter: "blur(8px)",
          ...(hovered && { opacity: 1, filter: "none", transform: "scale(1)" }),
        }}
      >
        {/* Logo area */}
        <div className="flex h-full flex-col p-3">
          <div className="flex items-center gap-2">
            {pizzeria.logo_url ? (
              <img
                src={pizzeria.logo_url}
                alt={pizzeria.name}
                className="h-8 w-8 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${accent}33` }}
              >
                <Store className="h-4 w-4" style={{ color: accent }} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-tight text-white">
                {pizzeria.name}
              </p>
              {city && (
                <p className="flex items-center gap-0.5 truncate text-[9px] text-white/50">
                  <MapPin className="h-2 w-2 flex-shrink-0" />
                  {city}
                </p>
              )}
            </div>
          </div>

          {/* Decorative lines mimicking menu items */}
          <div className="mt-auto space-y-1.5 pt-2">
            <div className="h-1 w-full rounded-full bg-white/8" />
            <div className="h-1 w-3/4 rounded-full bg-white/6" />
            <div className="h-1 w-1/2 rounded-full bg-white/4" />
          </div>
        </div>

        {/* Accent bottom bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      </div>

      {/* Hover preview card */}
      {hovered && (
        <div
          className="absolute left-1/2 top-full z-50 mt-2 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-white/20 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
          style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(20px)" }}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              {pizzeria.logo_url ? (
                <img src={pizzeria.logo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}33` }}>
                  <Store className="h-3.5 w-3.5" style={{ color: accent }} />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-white leading-tight">{pizzeria.name}</p>
                <p className="text-[9px] text-white/50">{city}</p>
              </div>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-semibold text-white transition-opacity hover:opacity-80"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Visualizar Site
            </a>
          </div>
        </div>
      )}
    </div>
  );
});

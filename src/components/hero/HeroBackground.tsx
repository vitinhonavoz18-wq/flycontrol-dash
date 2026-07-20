import { useEffect, useState, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HeroCarousel } from "./HeroCarousel";
import { HeroOverlay } from "./HeroOverlay";
import type { PizzeriaCard } from "./HeroCard";

interface HeroBackgroundProps {
  mouseX: number;
  mouseY: number;
}

export const HeroBackground = memo(function HeroBackground({
  mouseX,
  mouseY,
}: HeroBackgroundProps) {
  const [pizzerias, setPizzerias] = useState<PizzeriaCard[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Only fetch what we need: id, name, slug, logo, neighborhood, address, public_url, primary_color
      // Filter: must be active and have a slug (i.e. published)
      const { data, error } = await supabase
        .from("pizzerias")
        .select("id, name, slug, logo_url, neighborhood, address, public_url, primary_color")
        .eq("is_active", true)
        .not("slug", "is", null)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(60);

      if (cancelled || error) return;
      if (data && data.length > 0) {
        setPizzerias(data as PizzeriaCard[]);
      } else {
        // Fallback: show demo cards so Hero is never empty
        setPizzerias(DEMO_CARDS);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* Dark base */}
      <div className="absolute inset-0 bg-[#040406]" />

      {/* Ambient noise texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Carousel mosaic */}
      <HeroCarousel pizzerias={pizzerias} mouseX={mouseX} mouseY={mouseY} />

      {/* Dark overlay + vignette */}
      <HeroOverlay />
    </>
  );
});

// Demo cards when no real data is available (empty DB or anonymous)
const DEMO_CARDS: PizzeriaCard[] = [
  { id: "d1", name: "Pizzaria Bella Napoli", slug: "bella-napoli", logo_url: null, neighborhood: "Centro", address: "São Paulo, SP", public_url: null, primary_color: "#e63946" },
  { id: "d2", name: "Burger House", slug: "burger-house", logo_url: null, neighborhood: "Pinheiros", address: "São Paulo, SP", public_url: null, primary_color: "#f4a261" },
  { id: "d3", name: "Sushi & Co", slug: "sushi-co", logo_url: null, neighborhood: "Moema", address: "São Paulo, SP", public_url: null, primary_color: "#2a9d8f" },
  { id: "d4", name: "Taco Loco", slug: "taco-loco", logo_url: null, neighborhood: "Vila Madalena", address: "São Paulo, SP", public_url: null, primary_color: "#e9c46a" },
  { id: "d5", name: "Churrascaria do Zé", slug: "churrascaria-ze", logo_url: null, neighborhood: "Itaim Bibi", address: "São Paulo, SP", public_url: null, primary_color: "#e76f51" },
  { id: "d6", name: "La Pasta Fresca", slug: "la-pasta", logo_url: null, neighborhood: "Jardins", address: "São Paulo, SP", public_url: null, primary_color: "#457b9d" },
  { id: "d7", name: "Esfiha Express", slug: "esfiha-express", logo_url: null, neighborhood: "Liberdade", address: "São Paulo, SP", public_url: null, primary_color: "#a8dadc" },
  { id: "d8", name: "Açaí & Cia", slug: "acai-cia", logo_url: null, neighborhood: "Bela Vista", address: "São Paulo, SP", public_url: null, primary_color: "#6a0572" },
  { id: "d9", name: "Hot Dog Gourmet", slug: "hotdog-gourmet", logo_url: null, neighborhood: "Santana", address: "São Paulo, SP", public_url: null, primary_color: "#ffb703" },
  { id: "d10", name: "Crepe & Arte", slug: "crepe-arte", logo_url: null, neighborhood: "Consolação", address: "São Paulo, SP", public_url: null, primary_color: "#fb8500" },
  { id: "d11", name: "Bar do Pedrinho", slug: "bar-pedrinho", logo_url: null, neighborhood: "Lapa", address: "São Paulo, SP", public_url: null, primary_color: "#219ebc" },
  { id: "d12", name: "Marmita Fit", slug: "marmita-fit", logo_url: null, neighborhood: "Saúde", address: "São Paulo, SP", public_url: null, primary_color: "#52b788" },
];

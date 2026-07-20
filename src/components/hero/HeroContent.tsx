import { memo } from "react";
import { HeroButtons } from "./HeroButtons";
import { HeroStats } from "./HeroStats";
import logo from "@/assets/flycontrol-logo-hero.png";

export const HeroContent = memo(function HeroContent() {
  return (
    <div className="relative z-20 flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      {/* Glass panel */}
      <div
        className="relative w-full max-w-3xl rounded-3xl px-8 py-12 md:px-14 md:py-16"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
          backdropFilter: "blur(2px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04) inset, 0 40px 80px -20px rgba(0,0,0,0.4)",
        }}
      >
        {/* Live badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Sistema ao vivo · Pedidos em tempo real
          </span>
        </div>

        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-3xl"
              style={{
                background: "radial-gradient(circle, rgba(255,90,0,0.4) 0%, transparent 70%)",
              }}
            />
            <img
              src={logo}
              alt="FlyControl"
              className="h-auto w-48 select-none object-contain md:w-64"
              draggable={false}
            />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-balance text-4xl font-black leading-[1.08] tracking-tight text-white md:text-5xl lg:text-6xl">
          Seu restaurante vendendo{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #ff5a00 0%, #ff8c00 45%, #ffc247 100%)",
            }}
          >
            mais e melhor
          </span>
          ,{" "}
          <span className="text-white/70">do pedido ao caixa.</span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/50 md:text-lg">
          Cardápio digital, gestão de mesas, pedidos em tempo real, comissões de garçons, financeiro e site próprio —{" "}
          <span className="text-white/70 font-medium">tudo integrado em um único sistema.</span>
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            "🔔 Pedidos realtime",
            "🖨️ Impressão automática",
            "📊 Financeiro",
            "🍽️ Mesas & Comandas",
            "📱 Cardápio Digital",
            "🌐 Site Público",
          ].map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50"
            >
              {pill}
            </span>
          ))}
        </div>

        {/* Buttons */}
        <HeroButtons />

        {/* Divider */}
        <div className="mt-10 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/8" />
          <span className="text-xs text-white/20 uppercase tracking-widest">Números reais</span>
          <div className="h-px flex-1 bg-white/8" />
        </div>

        {/* Stats */}
        <HeroStats />
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
        <span className="text-[10px] uppercase tracking-widest text-white">Rolar</span>
        <div className="flex h-8 w-5 items-start justify-center rounded-full border border-white/30 p-1">
          <div className="h-1.5 w-1 animate-bounce rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
});

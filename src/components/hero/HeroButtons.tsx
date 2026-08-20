import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";

export const HeroButtons = memo(function HeroButtons() {
  return (
    <>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
        {/* Primary CTA */}
        <Link
          to="/signup"
          search={{ plan: undefined }}
          className="w-full sm:w-auto"
          aria-label="Criar conta gratuita no FlyControl"
        >
          <button
            className="group relative h-13 w-full overflow-hidden rounded-xl px-8 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-8px_rgba(255,90,0,0.65)] sm:w-auto"
            style={{
              background: "linear-gradient(135deg, #ff5a00 0%, #ff7a00 50%, #ff9500 100%)",
              boxShadow: "0 8px 24px -6px rgba(255,90,0,0.55), inset 0 1px 0 rgba(255,220,100,0.3)",
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              Começar Gratuitamente
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
            {/* Shimmer effect */}
            <span
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              aria-hidden="true"
            />
          </button>
        </Link>

        {/* Secondary CTA — leva para a apresentação já pronta em vez de um
            vídeo que não existe. Um botão de "demonstração em breve" numa
            página de vendas passa a impressão de produto incompleto. */}
        <Link
          to="/presentation"
          className="w-full sm:w-auto"
          aria-label="Ver apresentação do FlyControl"
        >
          <button className="group flex h-13 w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-8 text-sm font-semibold text-white/80 backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/10 hover:text-white sm:w-auto">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-all duration-300 group-hover:border-primary/50 group-hover:bg-primary/20">
              <Play className="h-3 w-3 fill-current translate-x-0.5" />
            </span>
            Ver Demonstração
          </button>
        </Link>
      </div>

      {/* Also have login link */}
      <p className="mt-4 text-xs text-white/30">
        Já tem conta?{" "}
        <Link
          to="/login"
          className="text-white/50 underline underline-offset-2 hover:text-white/80 transition-colors"
        >
          Entrar
        </Link>
      </p>
    </>
  );
});

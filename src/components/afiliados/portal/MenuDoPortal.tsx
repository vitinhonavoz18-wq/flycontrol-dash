import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownToLine,
  BadgeDollarSign,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoDoPortal } from "./Casca";

type Item = {
  to:
    | "/affiliates/dashboard"
    | "/affiliates/dashboard/referrals"
    | "/affiliates/dashboard/commissions"
    | "/affiliates/dashboard/withdrawals"
    | "/affiliates/dashboard/materials"
    | "/affiliates/dashboard/settings";
  rotulo: string;
  curto: string;
  icone: React.ComponentType<{ className?: string }>;
};

const ITENS_DO_MENU: Item[] = [
  { to: "/affiliates/dashboard", rotulo: "Visão Geral", curto: "Início", icone: LayoutDashboard },
  {
    to: "/affiliates/dashboard/referrals",
    rotulo: "Indicações",
    curto: "Indicações",
    icone: Users,
  },
  {
    to: "/affiliates/dashboard/commissions",
    rotulo: "Comissões",
    curto: "Comissões",
    icone: BadgeDollarSign,
  },
  {
    to: "/affiliates/dashboard/withdrawals",
    rotulo: "Saques",
    curto: "Saques",
    icone: ArrowDownToLine,
  },
  {
    to: "/affiliates/dashboard/materials",
    rotulo: "Materiais",
    curto: "Materiais",
    icone: Megaphone,
  },
  {
    to: "/affiliates/dashboard/settings",
    rotulo: "Configurações",
    curto: "Ajustes",
    icone: Settings,
  },
];

function estaAtivo(caminho: string, to: string) {
  const limpo = caminho.replace(/\/+$/, "");
  return to === "/affiliates/dashboard" ? limpo === to : limpo === to || limpo.startsWith(`${to}/`);
}

/** Menu lateral: computador e tablet deitado. */
export function MenuLateral({ nome, aoSair }: { nome: string; aoSair: () => void }) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/[0.06] bg-black/60 px-4 py-6 lg:flex">
      <div className="px-2">
        <LogoDoPortal />
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Menu do parceiro">
        {ITENS_DO_MENU.map((item) => {
          const ativo = estaAtivo(caminho, item.to);
          const Icone = item.icone;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-[12px] px-3 text-sm transition-colors",
                ativo
                  ? "bg-[#ff5a00]/12 font-medium text-white shadow-[inset_2px_0_0_#ff5a00]"
                  : "text-white/60 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Icone className={cn("size-[18px]", ativo ? "text-[#ff8a3d]" : "")} />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/[0.06] pt-4">
        <p className="truncate px-3 text-sm text-white/80">{nome}</p>
        <button
          type="button"
          onClick={aoSair}
          className="mt-2 flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-sm text-white/55 hover:bg-white/[0.04] hover:text-white"
        >
          <LogOut className="size-[18px]" /> Sair
        </button>
      </div>
    </aside>
  );
}

/**
 * Celular: barra fixa embaixo, ao alcance do polegar. Quatro atalhos e um
 * "Mais" que abre o resto — seis ícones apertados numa barra de 360px
 * viram alvo pequeno demais para o dedo.
 */
export function MenuDeBaixo({ aoSair }: { aoSair: () => void }) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState(false);
  const principais = ITENS_DO_MENU.slice(0, 4);
  const resto = ITENS_DO_MENU.slice(4);
  const restoAtivo = resto.some((i) => estaAtivo(caminho, i.to));

  return (
    <>
      {aberto ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setAberto(false)}
          aria-hidden
        />
      ) : null}
      {aberto ? (
        <div
          role="dialog"
          aria-label="Mais opções"
          className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 rounded-[20px] border border-white/10 bg-[#0b0b0b] p-2 shadow-2xl lg:hidden"
        >
          {resto.map((item) => {
            const Icone = item.icone;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setAberto(false)}
                className="flex h-12 items-center gap-3 rounded-[14px] px-4 text-sm text-white hover:bg-white/5"
              >
                <Icone className="size-5 text-white/60" /> {item.rotulo}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              aoSair();
            }}
            className="flex h-12 w-full items-center gap-3 rounded-[14px] px-4 text-sm text-white/70 hover:bg-white/5"
          >
            <LogOut className="size-5 text-white/50" /> Sair
          </button>
        </div>
      ) : null}

      <nav
        aria-label="Menu do parceiro"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5">
          {principais.map((item) => {
            const ativo = estaAtivo(caminho, item.to);
            const Icone = item.icone;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px]",
                  ativo ? "text-[#ff8a3d]" : "text-white/55",
                )}
              >
                <Icone className="size-[22px]" />
                {item.curto}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px]",
              restoAtivo || aberto ? "text-[#ff8a3d]" : "text-white/55",
            )}
          >
            {aberto ? <X className="size-[22px]" /> : <MoreHorizontal className="size-[22px]" />}
            Mais
          </button>
        </div>
      </nav>
    </>
  );
}

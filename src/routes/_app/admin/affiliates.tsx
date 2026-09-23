import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  BadgeDollarSign,
  Handshake,
  LayoutDashboard,
  ScrollText,
  Settings,
  Store,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/affiliates")({ component: AfiliadosAdmin });

/**
 * Painel Admin → Afiliados.
 *
 * Mora dentro de `/admin`, então herda a porta do painel: quem não é
 * administrador é mandado de volta para o próprio painel antes de ver
 * qualquer coisa. E, mesmo que alguém pulasse a tela, cada número daqui vem
 * de uma função do banco que confere de novo se é administrador.
 */
const SECOES = [
  { to: "/admin/affiliates", rotulo: "Visão Geral", icone: LayoutDashboard, exato: true },
  { to: "/admin/affiliates/partners", rotulo: "Afiliados", icone: Users },
  { to: "/admin/affiliates/referrals", rotulo: "Indicações", icone: Store },
  { to: "/admin/affiliates/commissions", rotulo: "Comissões", icone: BadgeDollarSign },
  { to: "/admin/affiliates/withdrawals", rotulo: "Saques", icone: ArrowDownToLine },
  { to: "/admin/affiliates/settings", rotulo: "Configurações", icone: Settings },
  { to: "/admin/affiliates/audit", rotulo: "Auditoria", icone: ScrollText },
] as const;

function AfiliadosAdmin() {
  const caminho = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "");

  return (
    <div className="p-4 pb-24 md:p-8">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Handshake className="h-6 w-6 text-primary md:h-7 md:w-7" aria-hidden="true" />
          Afiliados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Parceiros que indicam o FlyControl: aprovação, comissões, saques e auditoria.
        </p>
      </div>

      {/* Mesmo desenho das abas do resto do Painel Admin; rola para o lado no
          celular em vez de espremer os rótulos. */}
      <nav
        className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0"
        aria-label="Seções de afiliados"
      >
        <div className="flex w-max gap-1 rounded-xl bg-muted/50 p-1">
          {SECOES.map((s) => {
            const ativa =
              "exato" in s && s.exato
                ? caminho === s.to
                : caminho === s.to || caminho.startsWith(`${s.to}/`);
            const Icone = s.icone;
            return (
              <Link
                key={s.to}
                to={s.to}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  ativa
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {s.rotulo}
              </Link>
            );
          })}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { MoreHorizontal, Search, LogOut, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import {
  ADMIN_MOBILE_ITEMS,
  MOBILE_MORE_ITEMS,
  MOBILE_PRIMARY_ITEMS,
  isNavItemActive,
  visibleOwnerItems,
  type NavItem,
} from "@/lib/navigation";

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPlatformAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [openMore, setOpenMore] = useState(false);
  const showAdmin = isPlatformAdmin;

  // "Plano e cobrança" mostra a assinatura do DONO da loja — administradores
  // não assinam a própria plataforma, então o item some para eles.
  // Também somem daqui as áreas ainda em obra — ver src/lib/feature-flags.ts.
  const ownerItems = visibleOwnerItems(MOBILE_MORE_ITEMS, { isPlatformAdmin });

  const isActive = (it: NavItem) => isNavItemActive(it, path);
  const moreIsActive =
    !MOBILE_PRIMARY_ITEMS.some(isActive) &&
    [...ownerItems, ...(showAdmin ? ADMIN_MOBILE_ITEMS : [])].some(isActive);

  return (
    <>
      {/* Bottom Nav — mobile only */}
      <nav
        // Fundo opaco no lugar do `backdrop-blur`: a barra é fixa e está sempre
        // visível, então o filtro custava GPU o tempo todo em Android
        // intermediário, inclusive durante a rolagem. No tema escuro a
        // diferença visual é imperceptível.
        className="fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] border-t border-border bg-background md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_PRIMARY_ITEMS.map((it) => {
            const active = isActive(it);
            return (
              <li key={it.to}>
                <Link
                  to={it.to}
                  // Com o aparelho deitado o rótulo sai e a altura cai para 44px
                  // (o mínimo de toque): 72px de barra em uma tela de 360px
                  // custava 20% do espaço vertical. O `aria-label` mantém o
                  // item identificável sem o texto visível.
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors landscape-compact:min-h-11 landscape-compact:gap-0 landscape-compact:py-1 ${
                    active ? "text-primary" : "text-muted-foreground active:text-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                  aria-label={it.label}
                >
                  <it.icon
                    className={`h-6 w-6 landscape-compact:h-5 landscape-compact:w-5 ${active ? "scale-110" : ""} transition-transform`}
                  />
                  <span className="max-w-full truncate px-1 landscape-compact:hidden">
                    {it.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpenMore(true)}
              className={`w-full flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[11px] font-medium ${
                moreIsActive ? "text-primary" : "text-muted-foreground active:text-foreground"
              }`}
              aria-label="Mais opções"
            >
              <MoreHorizontal className="h-6 w-6" />
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={openMore} onOpenChange={setOpenMore}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-border bg-background">
            <div>
              <h2 className="text-lg font-bold">Mais</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[240px]">{user?.email}</p>
            </div>
            <button
              onClick={() => setOpenMore(false)}
              aria-label="Fechar"
              className="h-11 w-11 grid place-items-center rounded-full hover:bg-muted active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3">
            <SectionLabel>Gestão</SectionLabel>
            <Grid items={ownerItems} path={path} onPick={() => setOpenMore(false)} />

            {showAdmin && (
              <>
                <SectionLabel className="mt-4">Painel Admin</SectionLabel>
                <Grid items={ADMIN_MOBILE_ITEMS} path={path} onPick={() => setOpenMore(false)} />
              </>
            )}

            <div className="mt-4 px-2">
              <Link
                to="/search-orders"
                onClick={() => setOpenMore(false)}
                className="flex items-center gap-3 min-h-12 px-3 rounded-xl hover:bg-muted text-base"
              >
                <Search className="h-5 w-5 text-muted-foreground" /> Buscar Pedidos
              </Link>
              <button
                onClick={async () => {
                  setOpenMore(false);
                  await signOut();
                  nav({ to: "/" });
                }}
                className="mt-2 w-full flex items-center gap-3 min-h-12 px-3 rounded-xl text-base text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" /> Sair
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
}

function Grid({
  items,
  path,
  onPick,
}: {
  items: readonly NavItem[];
  path: string;
  onPick: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => {
        const active = isNavItemActive(it, path);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onPick}
            className={`flex items-center gap-3 min-h-16 px-3 rounded-xl border transition-colors ${
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <div
              className={`h-10 w-10 grid place-items-center rounded-lg ${active ? "bg-primary/15" : "bg-muted"}`}
            >
              <it.icon className={`h-5 w-5 ${active ? "text-primary" : "text-foreground"}`} />
            </div>
            <span className="text-sm font-semibold leading-tight">{it.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

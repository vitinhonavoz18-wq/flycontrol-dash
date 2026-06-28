import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Menu as MenuIcon,
  LayoutGrid,
  MoreHorizontal,
  Package,
  BarChart3,
  Settings,
  Search,
  Store,
  PieChart,
  UtensilsCrossed,
  Wallet,
  BookOpen,
  LogOut,
  Users,
  CreditCard,
  X,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: (p: string) => boolean };

const PRIMARY: Item[] = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/search-orders", label: "Pedidos", icon: ShoppingBag },
  { to: "/menu", label: "Cardápio", icon: MenuIcon },
  { to: "/tables", label: "Mesas", icon: LayoutGrid },
];

const MORE_OWNER: Item[] = [
  { to: "/my-store", label: "Minha Loja", icon: Store },
  { to: "/combos", label: "Combos / Produtos", icon: Package },
  { to: "/finance", label: "Relatórios", icon: BarChart3 },
  { to: "/commissions", label: "Comissões", icon: Wallet },
  { to: "/waiters", label: "Garçons", icon: UtensilsCrossed },
  { to: "/settings", label: "Configurações", icon: Settings },
  { to: "/docs", label: "Documentação", icon: BookOpen },
];

const MORE_ADMIN: Item[] = [
  { to: "/admin/pizzerias", label: "FlyPizzarias", icon: Store, match: (p) => p.startsWith("/admin/pizzerias") },
  { to: "/admin/analytics", label: "Insights Globais", icon: PieChart, match: (p) => p.startsWith("/admin/analytics") },
  { to: "/admin/finance", label: "Financeiro Global", icon: BarChart3, match: (p) => p.startsWith("/admin/finance") },
  { to: "/admin/users", label: "Usuários", icon: Users, match: (p) => p.startsWith("/admin/users") },
  { to: "/admin/subscriptions", label: "Planos", icon: CreditCard, match: (p) => p.startsWith("/admin/subscriptions") },
];

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, isSuperAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [openMore, setOpenMore] = useState(false);
  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const showAdmin = isSuperAdmin || isHardcodedAdmin;

  const isActive = (it: Item) => (it.match ? it.match(path) : path === it.to);
  const moreIsActive =
    !PRIMARY.some(isActive) &&
    [...MORE_OWNER, ...(showAdmin ? MORE_ADMIN : [])].some((i) => (i.match ? i.match(path) : path === i.to));

  return (
    <>
      {/* Bottom Nav — mobile only */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-5">
          {PRIMARY.map((it) => {
            const active = isActive(it);
            return (
              <li key={it.to}>
                <Link
                  to={it.to}
                  className={`flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground active:text-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <it.icon className={`h-6 w-6 ${active ? "scale-110" : ""} transition-transform`} />
                  <span className="truncate max-w-full px-1">{it.label}</span>
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
            <Grid items={MORE_OWNER} path={path} onPick={() => setOpenMore(false)} />

            {showAdmin && (
              <>
                <SectionLabel className="mt-4">Painel Admin</SectionLabel>
                <Grid items={MORE_ADMIN} path={path} onPick={() => setOpenMore(false)} />
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

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}

function Grid({ items, path, onPick }: { items: Item[]; path: string; onPick: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => {
        const active = it.match ? it.match(path) : path === it.to;
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
            <div className={`h-10 w-10 grid place-items-center rounded-lg ${active ? "bg-primary/15" : "bg-muted"}`}>
              <it.icon className={`h-5 w-5 ${active ? "text-primary" : "text-foreground"}`} />
            </div>
            <span className="text-sm font-semibold leading-tight">{it.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

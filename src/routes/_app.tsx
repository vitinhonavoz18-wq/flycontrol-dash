import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Store, BarChart3, Users, LogOut, Settings, BookOpen } from "lucide-react";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, loading, isSuperAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando...</div>;
  }

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/finance", label: "Gestão Financeira", icon: BarChart3 },
    { to: "/settings", label: "Configurações", icon: Settings },
    { to: "/docs", label: "Documentação", icon: BookOpen },
  ];
  const adminItems = [
    { to: "/admin", label: "FlyPizzarias", icon: Store },
    { to: "/admin/analytics", label: "Insights Globais", icon: BarChart3 },
    { to: "/admin/users", label: "Usuários", icon: Users },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <Link to="/dashboard" className="flex h-48 items-center justify-center border-b border-sidebar-border px-5">
          <img src={logo} alt="FlyControl" className="h-40 w-auto object-contain drop-shadow-[0_0_25px_rgba(255,122,0,0.7)]" />
        </Link>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((it) => (
            <Link key={it.to} to={it.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                path === it.to ? "bg-primary/15 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}>
              <it.icon className="h-4 w-4" /> {it.label}
            </Link>
          ))}
          {isSuperAdmin && (
            <>
              <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-muted-foreground">Admin</div>
              {adminItems.map((it) => (
                <Link key={it.to} to={it.to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    path.startsWith(it.to) && (it.to !== "/admin" || path === "/admin") ? "bg-primary/15 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}>
                  <it.icon className="h-4 w-4" /> {it.label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-border p-3">
          <div className="px-2 pb-2 text-xs text-muted-foreground truncate">{user.email}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={async () => { await signOut(); nav({ to: "/" }); }}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

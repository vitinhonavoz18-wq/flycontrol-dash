import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Store, 
  BarChart3, 
  Users, 
  LogOut, 
  Settings, 
  BookOpen,
  Menu,
  X,
  PieChart
} from "lucide-react";
import logo from "@/assets/flycontrol-logo.png";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, loading, isSuperAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    { to: "/admin/analytics", label: "Insights Globais", icon: PieChart },
    { to: "/admin/users", label: "Usuários", icon: Users },
  ];

  const NavItems = ({ className = "" }: { className?: string }) => (
    <nav className={`flex-1 space-y-1 p-3 ${className}`}>
      <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground/70">Menu Principal</div>
      {items.map((it) => (
        <Link 
          key={it.to} 
          to={it.to}
          onClick={() => setIsMobileMenuOpen(false)}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
            path === it.to 
              ? "bg-primary/20 text-primary shadow-sm" 
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1"
          }`}
        >
          <it.icon className={`h-4 w-4 ${path === it.to ? "text-primary" : "text-muted-foreground"}`} /> 
          {it.label}
        </Link>
      ))}
      
      {isSuperAdmin && (
        <>
          <div className="px-3 pb-1 pt-6 text-xs font-semibold uppercase text-muted-foreground/70 border-t border-sidebar-border mt-4">Painel Admin</div>
          {adminItems.map((it) => (
            <Link 
              key={it.to} 
              to={it.to}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                path.startsWith(it.to) && (it.to !== "/admin" || path === "/admin") 
                  ? "bg-primary/20 text-primary shadow-sm" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1"
              }`}
            >
              <it.icon className={`h-4 w-4 ${path.startsWith(it.to) ? "text-primary" : "text-muted-foreground"}`} /> 
              {it.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex shadow-xl z-20">
        <Link to="/dashboard" className="flex h-24 items-center justify-center border-b border-sidebar-border px-6 overflow-hidden">
          <img 
            src={logo} 
            alt="FlyControl" 
            className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,122,0,0.5)] transition-transform hover:scale-105 duration-300" 
          />
        </Link>
        
        <NavItems />

        <div className="mt-auto border-t border-border p-4 bg-sidebar-accent/30">
          <div className="flex flex-col mb-3 px-2">
            <span className="text-xs font-bold text-foreground truncate">{user.email?.split('@')[0]}</span>
            <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-colors" 
            onClick={async () => { await signOut(); nav({ to: "/" }); }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-16 flex items-center justify-between px-4 border-b border-border bg-background md:hidden sticky top-0 z-30 shadow-sm">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logo} alt="FlyControl" className="h-8 w-auto" />
            <span className="font-bold text-sm tracking-tight">FlyControl</span>
          </Link>
          
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 border-r-primary/20 bg-sidebar">
              <div className="flex flex-col h-full">
                <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-primary/5">
                  <span className="font-bold text-lg text-primary">FlyControl</span>
                </div>
                <NavItems className="py-4" />
                <div className="mt-auto border-t border-sidebar-border p-4">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start border-primary/20 text-primary" 
                    onClick={async () => { await signOut(); nav({ to: "/" }); }}
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Sair
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-x-hidden relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

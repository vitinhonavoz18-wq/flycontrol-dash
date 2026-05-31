import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Printer, BarChart3, Shield, Zap, ChefHat, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import logo from "@/assets/flycontrol-logo-hero.png";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-[-10%] h-[700px] w-[1100px] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.45), transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-20%] left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 70%)" }}
        />
      </div>

      {/* Theme toggle (top-right, floating, no header line) */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 backdrop-blur md:right-8 md:top-6">
        <Sun className={`h-4 w-4 transition ${isDark ? "text-muted-foreground" : "text-primary"}`} />
        <Switch
          checked={isDark}
          onCheckedChange={(c) => setTheme(c ? "dark" : "light")}
          aria-label="Alternar tema"
        />
        <Moon className={`h-4 w-4 transition ${isDark ? "text-primary" : "text-muted-foreground"}`} />
      </div>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-16 text-center md:pt-24">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.55), transparent 65%)" }}
          />
          <img
            src={logo}
            alt="FlyControl"
            className="mx-auto h-auto w-[280px] select-none object-contain drop-shadow-[0_0_40px_rgba(255,122,0,0.55)] sm:w-[380px] md:w-[480px] lg:w-[560px]"
            draggable={false}
          />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link to="/login" className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full border-primary/50 bg-background/40 px-10 text-base font-semibold backdrop-blur transition hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_25px_rgba(255,122,0,0.35)] sm:w-auto"
            >
              Entrar
            </Button>
          </Link>
          <Link to="/signup" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="h-12 w-full border-0 px-10 text-base font-semibold text-white shadow-[0_0_30px_rgba(255,122,0,0.45)] transition hover:shadow-[0_0_45px_rgba(255,122,0,0.7)] sm:w-auto"
              style={{ background: "linear-gradient(135deg, hsl(35 100% 55%), hsl(20 100% 50%))" }}
            >
              Começar grátis
            </Button>
          </Link>
          <Link to="/presentation" className="w-full sm:w-auto">
            <Button
              variant="ghost"
              size="lg"
              className="h-12 w-full border-border/40 bg-card/20 px-10 text-base font-semibold backdrop-blur transition hover:bg-card/40 sm:w-auto"
            >
              <Layout className="mr-2 h-5 w-5 text-primary" />
              Ver Apresentação
            </Button>
          </Link>
        </div>

        <span className="mt-12 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Painel central para deliveries criados pelo SiteCreatorFly
        </span>

        <h1 className="mx-auto mt-8 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Gerencie todos os seus{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, hsl(35 100% 55%), hsl(20 100% 50%))" }}
          >
            pedidos
          </span>{" "}
          em tempo real
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          FlyControl recebe seus pedidos automaticamente, toca alerta sonoro, imprime a comanda e mantém você no controle de cada etapa.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Bell, title: "Realtime + som", desc: "Novos pedidos chegam instantaneamente com alerta sonoro." },
            { icon: Printer, title: "Impressão automática", desc: "Comanda formatada para impressora térmica em 1 clique." },
            { icon: BarChart3, title: "Métricas claras", desc: "Faturamento, ticket médio e horários de pico." },
            { icon: Shield, title: "Multi-tenant seguro", desc: "Cada pizzaria vê apenas seus dados, com RLS." },
            { icon: ChefHat, title: "Status do pedido", desc: "Novo → Preparando → Saiu → Entregue, com 1 toque." },
            { icon: Zap, title: "Integração SiteCreatorFly", desc: "Seus sites enviam pedidos via API key automaticamente." },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border/60 bg-card/40 p-6 backdrop-blur transition hover:border-primary/50 hover:shadow-[0_0_30px_rgba(255,122,0,0.18)]"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} FlyControl. Todos os direitos reservados.
      </footer>
    </div>
  );
}

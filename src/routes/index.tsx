import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Bell, Printer, BarChart3, Shield, Zap, ChefHat } from "lucide-react";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="FlyControl" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(255,122,0,0.6)]" />
            <span className="text-lg font-bold tracking-tight text-gradient-fire">FlyControl</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Entrar</Button></Link>
            <Link to="/signup"><Button>Começar grátis</Button></Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--gradient-primary)" }} />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Painel central para deliveries criados pelo SiteCreatorFly
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
            Gerencie todos os seus <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>pedidos</span> em tempo real
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            FlyControl recebe seus pedidos automaticamente, toca alerta sonoro, imprime a comanda e mantém você no controle de cada etapa.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Link to="/signup"><Button size="lg" className="h-12 px-8 text-base">Criar conta grátis</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline" className="h-12 px-8 text-base">Acessar painel</Button></Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Bell, title: "Realtime + som", desc: "Novos pedidos chegam instantaneamente com alerta sonoro." },
            { icon: Printer, title: "Impressão automática", desc: "Comanda formatada para impressora térmica em 1 clique." },
            { icon: BarChart3, title: "Métricas claras", desc: "Faturamento, ticket médio e horários de pico." },
            { icon: Shield, title: "Multi-tenant seguro", desc: "Cada pizzaria vê apenas seus dados, com RLS." },
            { icon: ChefHat, title: "Status do pedido", desc: "Novo → Preparando → Saiu → Entregue, com 1 toque." },
            { icon: Zap, title: "Integração SiteCreatorFly", desc: "Seus sites enviam pedidos via API key automaticamente." },
          ].map((f) => (
            <div key={f.title} className="group rounded-xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-[var(--shadow-glow)]">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} FlyControl. Todos os direitos reservados.
      </footer>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Printer, BarChart3, Shield, Zap, ChefHat } from "lucide-react";
import { Hero } from "@/components/hero/Hero";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="bg-[#040406] text-white">
      {/* ── HERO ─────────────────────────────────────────── */}
      <Hero />

      {/* ── FEATURES ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Tudo que seu restaurante precisa
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            Uma plataforma. Zero complicação.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/40">
            Cada funcionalidade foi pensada para o dia a dia real de quem trabalha com food service.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Bell,
              title: "Pedidos em tempo real",
              desc: "Novos pedidos chegam instantaneamente com alerta sonoro e notificação visual. Zero atraso.",
            },
            {
              icon: Printer,
              title: "Impressão automática",
              desc: "Comanda formatada para impressora térmica em 1 clique. Sem erros, sem letra feia.",
            },
            {
              icon: BarChart3,
              title: "Gestão financeira",
              desc: "Faturamento diário, ticket médio, horários de pico e relatórios exportáveis.",
            },
            {
              icon: Shield,
              title: "Multi-tenant seguro",
              desc: "Cada estabelecimento vê apenas seus dados, com Row Level Security no banco.",
            },
            {
              icon: ChefHat,
              title: "Status de pedido",
              desc: "Novo → Preparando → Saiu → Entregue. Atualização em 1 toque, cliente sempre informado.",
            },
            {
              icon: Zap,
              title: "Integração SiteCreatorFly",
              desc: "Seus sites criados no SiteCreatorFly enviam pedidos automaticamente via API key.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/6 bg-white/3 p-6 backdrop-blur transition-all duration-300 hover:border-primary/30 hover:bg-white/5 hover:shadow-[0_0_40px_-12px_rgba(255,90,0,0.25)]"
            >
              <div
                className="mb-4 grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: "linear-gradient(135deg, rgba(255,90,0,0.2), rgba(255,150,0,0.1))" }}
              >
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div
          className="mx-auto max-w-3xl overflow-hidden rounded-3xl p-12 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(255,90,0,0.12) 0%, rgba(255,150,0,0.06) 100%)",
            border: "1px solid rgba(255,90,0,0.2)",
          }}
        >
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            Pronto para decolar?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base text-white/40">
            Comece hoje, sem cartão de crédito. Configure em minutos.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/signup">
              <button
                className="rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-6px_rgba(255,90,0,0.6)]"
                style={{
                  background: "linear-gradient(135deg, #ff5a00, #ff9500)",
                  boxShadow: "0 6px 20px -6px rgba(255,90,0,0.5)",
                }}
              >
                Criar conta gratuita
              </button>
            </Link>
            <Link to="/login">
              <button className="rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:text-white">
                Já tenho conta
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="border-t border-white/6 py-8 text-center text-xs text-white/20">
        © {new Date().getFullYear()} FlyControl. Todos os direitos reservados.
        <span className="mx-2 opacity-40">·</span>
        Powered by SiteCreatorFly
      </footer>
    </div>
  );
}

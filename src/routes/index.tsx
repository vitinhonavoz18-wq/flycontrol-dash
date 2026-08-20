import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Printer, BarChart3, Lock, Zap, ChefHat, Check } from "lucide-react";
import { Hero } from "@/components/hero/Hero";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";

export const Route = createFileRoute("/")({
  component: Landing,
});

const premium = PLAN_PRICING.premium;
const cents = PLAN_PRICING.cents;

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
              title: "O pedido chega e você já sabe",
              desc: "Assim que o cliente finaliza o pedido, toca um alerta sonoro e aparece na tela. Ninguém fica esperando por engano, ninguém perde pedido no meio da correria.",
            },
            {
              icon: Printer,
              title: "Comanda pronta pra cozinha",
              desc: "Um toque e a comanda sai impressa, organizada, fácil de ler. Sem letra torta, sem confusão de quem pediu o quê.",
            },
            {
              icon: BarChart3,
              title: "Quanto você vendeu, sem precisar somar nada",
              desc: "Veja o faturamento do dia, o valor médio de cada pedido e os horários de mais movimento — tudo pronto, sem precisar abrir planilha.",
            },
            {
              icon: Lock,
              title: "Cada loja só enxerga a própria loja",
              desc: "Se você tem mais de um estabelecimento no sistema, um nunca vê os pedidos, os clientes ou o faturamento do outro — é como se cada um tivesse seu próprio cofre.",
            },
            {
              icon: ChefHat,
              title: "O cliente acompanha cada etapa",
              desc: "Novo, preparando, saiu para entrega, entregue — o cliente vê em que pé está o pedido dele, sem precisar ligar perguntando.",
            },
            {
              icon: Zap,
              title: "Seu site de pedidos já conversa com o painel",
              desc: "Já tem um site de pedidos? O pedido cai direto aqui, na hora, sem ninguém copiar nada à mão de um lugar pro outro.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/6 bg-white/3 p-6 backdrop-blur transition-all duration-300 hover:border-primary/30 hover:bg-white/5 hover:shadow-[0_0_40px_-12px_rgba(255,90,0,0.25)]"
            >
              <div
                className="mb-4 grid h-10 w-10 place-items-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(255,90,0,0.2), rgba(255,150,0,0.1))",
                }}
              >
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PREÇOS ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Sem letra miúda
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Quanto custa</h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/40">
            Dois jeitos de pagar. Escolha o que combina com o tamanho da sua operação hoje — dá para
            trocar depois.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-primary/30 bg-white/3 p-8 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">{premium.name}</h3>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                Plano completo
              </span>
            </div>
            <div className="mb-4">
              <span className="text-4xl font-black text-primary">
                {formatCents(premium.monthlyFeeCents)}
              </span>
              <span className="text-sm text-white/40">/mês, valor fixo</span>
            </div>
            <p className="mb-6 text-sm text-white/50">
              Você sabe exatamente quanto vai pagar todo mês, não importa quantos pedidos entrarem.
              Ideal para quem já tem um movimento constante e quer controle total: mesas, garçons e
              comissões inclusos.
            </p>
            <ul className="space-y-2 text-sm text-white/70">
              {[
                "Pedidos sem cobrança por unidade",
                "Mesas, garçons e comissões",
                "Cardápio e clientes",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/6 bg-white/3 p-8 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">{cents.name}</h3>
              <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white/70">
                Pague por pedido
              </span>
            </div>
            <div className="mb-4">
              <span className="text-4xl font-black text-primary">
                {formatCents(cents.setupFeeCents)}
              </span>
              <span className="text-sm text-white/40"> de cadastro (só uma vez)</span>
              <p className="mt-1 text-sm font-semibold text-white">
                + {formatCents(cents.defaultOrderUnitPriceCents)} por pedido válido
              </p>
            </div>
            <p className="mb-6 text-sm text-white/50">
              Sem mensalidade. Você só paga pelos pedidos que realmente entram. Ideal para quem está
              começando ou tem um movimento mais variável. Ao passar de{" "}
              {cents.promotionThresholdOrders} pedidos válidos no mês, o valor por pedido cai para{" "}
              {formatCents(cents.promotionalOrderUnitPriceCents)} no mês seguinte.
            </p>
            <ul className="space-y-2 text-sm text-white/70">
              {[
                "Sem mensalidade fixa",
                "Gestão de pedidos e cardápio",
                "Fica mais barato quanto mais você vende",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-white/40">
          <Link to="/plans" className="font-semibold text-primary underline">
            Ver a comparação completa entre os planos
          </Link>
        </p>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div
          className="mx-auto max-w-3xl overflow-hidden rounded-3xl p-12 text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,90,0,0.12) 0%, rgba(255,150,0,0.06) 100%)",
            border: "1px solid rgba(255,90,0,0.2)",
          }}
        >
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">Pronto para decolar?</h2>
          <p className="mx-auto mt-3 max-w-md text-base text-white/40">
            Comece hoje, sem cartão de crédito. Configure em minutos.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/signup" search={{ plan: undefined }}>
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
      </footer>
    </div>
  );
}

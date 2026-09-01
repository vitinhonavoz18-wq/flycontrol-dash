import { Link } from "@tanstack/react-router";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";
import { Reveal, SectionHeading, SectionLabel, SectionText } from "./primitivos";

/**
 * Os dois jeitos de pagar.
 *
 * TODO NÚMERO AQUI VEM DO SISTEMA, NÃO DA PÁGINA
 *
 * Preço, faixa de desconto e duração do teste são lidos de `lib/billing`, que
 * é a mesma fonte que a cobrança usa para faturar. É o que impede o caso mais
 * feio possível: a página anunciar R$ 0,70 depois que o preço mudou, e o
 * cliente descobrir na fatura. Se o preço mudar lá, muda aqui sozinho.
 *
 * Nada de tabela comparativa gigante, nada de contagem regressiva, nada de
 * "últimas vagas". Escassez inventada é mentira com data marcada.
 */

const premium = PLAN_PRICING.premium;
const cents = PLAN_PRICING.cents;

export function PricingSection() {
  return (
    <section
      id="planos"
      aria-labelledby="planos-titulo"
      className="border-t px-5 py-24 sm:px-8 md:py-32"
      style={{ borderColor: "var(--fly-border-subtle)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal className="max-w-2xl">
          <SectionLabel>Planos</SectionLabel>
          <SectionHeading id="planos-titulo">Você escolhe como pagar.</SectionHeading>
          <SectionText className="max-w-lg">
            Começa com {TRIAL_DURATION_DAYS} dias grátis. Depois, o modelo que combina com o tamanho
            da sua operação — e dá para trocar quando quiser.
          </SectionText>
        </Reveal>

        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <article
              className="flex h-full flex-col rounded-[var(--fly-radius-lg)] p-8 sm:p-10"
              style={{
                background: "var(--fly-surface-02)",
                border: "1px solid rgb(var(--fly-primary-rgb) / .28)",
              }}
            >
              <h3 className="fly-subheading" style={{ color: "var(--fly-text-primary)" }}>
                {cents.name}
              </h3>
              <p className="mt-2 text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                Você paga por pedido. Sem mensalidade, sem taxa para entrar.
              </p>

              <p className="mt-8 flex items-baseline gap-2">
                <span
                  className="text-[clamp(2.75rem,6vw,3.5rem)] leading-none tracking-[-0.04em]"
                  style={{ color: "var(--fly-text-primary)" }}
                >
                  {formatCents(cents.defaultOrderUnitPriceCents)}
                </span>
                <span className="text-[15px]" style={{ color: "var(--fly-text-muted)" }}>
                  por pedido
                </span>
              </p>

              <p
                className="mt-6 rounded-[var(--fly-radius-sm)] px-4 py-3 text-[14px] leading-[1.5]"
                style={{
                  background: "var(--fly-primary-soft)",
                  color: "var(--fly-text-secondary)",
                }}
              >
                Ao passar de{" "}
                <strong style={{ color: "var(--fly-primary)" }}>
                  {cents.promotionThresholdOrders} pedidos
                </strong>{" "}
                válidos no mês, cada pedido cai para{" "}
                <strong style={{ color: "var(--fly-primary)" }}>
                  {formatCents(cents.promotionalOrderUnitPriceCents)}
                </strong>{" "}
                no mês seguinte.
              </p>

              <ul className="mt-8 space-y-3">
                {[
                  "Sem taxa para entrar",
                  "Sem mensalidade fixa",
                  "Pedidos, cardápio e clientes",
                  "Fica mais barato quanto mais você vende",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[9px] h-1 w-1 shrink-0 rounded-full"
                      style={{ background: "var(--fly-primary)" }}
                    />
                    <span className="text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 pt-2">
                <Link
                  to="/signup"
                  search={{ plan: undefined, google: undefined }}
                  className="inline-flex rounded-full px-6 py-3 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    background: "var(--fly-primary)",
                    color: "#000",
                    outlineColor: "var(--fly-primary)",
                  }}
                >
                  Começar grátis
                </Link>
              </div>
            </article>
          </Reveal>

          <Reveal atraso={120}>
            <article
              className="flex h-full flex-col rounded-[var(--fly-radius-lg)] p-8 sm:p-10"
              style={{
                background: "var(--fly-surface-01)",
                border: "1px solid var(--fly-border-subtle)",
              }}
            >
              <h3 className="fly-subheading" style={{ color: "var(--fly-text-primary)" }}>
                {premium.name}
              </h3>
              <p className="mt-2 text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                Mensalidade fixa. Você sabe exatamente quanto paga, entrando o pedido que entrar.
              </p>

              <p className="mt-8 flex items-baseline gap-2">
                <span
                  className="text-[clamp(2.75rem,6vw,3.5rem)] leading-none tracking-[-0.04em]"
                  style={{ color: "var(--fly-text-primary)" }}
                >
                  {formatCents(premium.monthlyFeeCents)}
                </span>
                <span className="text-[15px]" style={{ color: "var(--fly-text-muted)" }}>
                  por mês
                </span>
              </p>

              <ul className="mt-14 space-y-3">
                {[
                  "Pedidos sem cobrança por unidade",
                  "Mesas, garçons e comissões",
                  "Cardápio, clientes e marketing",
                  "A estrutura completa do FlyControl",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[9px] h-1 w-1 shrink-0 rounded-full"
                      style={{ background: "var(--fly-text-muted)" }}
                    />
                    <span className="text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 pt-2">
                <Link
                  to="/plans"
                  className="inline-flex rounded-full border px-6 py-3 text-[14px] font-medium transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: "var(--fly-border-strong)",
                    color: "var(--fly-text-primary)",
                    outlineColor: "var(--fly-primary)",
                  }}
                >
                  Comparar os planos
                </Link>
              </div>
            </article>
          </Reveal>
        </div>

        {/* O teste e a ajuda de implantação ficam aqui embaixo, em texto
            normal. Virar faixa colorida transformaria o argumento em anúncio
            — e quem lê anúncio desconfia. */}
        <Reveal atraso={200}>
          <div
            className="mt-4 grid gap-4 rounded-[var(--fly-radius-lg)] p-8 sm:grid-cols-2 sm:p-10"
            style={{
              background: "var(--fly-surface-01)",
              border: "1px solid var(--fly-border-subtle)",
            }}
          >
            <div>
              <h3
                className="text-[20px] tracking-[-0.02em]"
                style={{ color: "var(--fly-text-primary)" }}
              >
                {TRIAL_DURATION_DAYS} dias grátis
              </h3>
              <p className="mt-2 text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                Você usa o FlyControl inteiro antes de pagar qualquer coisa. Terminado o período,
                começa a cobrança do modelo que você escolher.
              </p>
            </div>
            <div>
              <h3
                className="text-[20px] tracking-[-0.02em]"
                style={{ color: "var(--fly-text-primary)" }}
              >
                Implementação gratuita
              </h3>
              <p className="mt-2 text-[15px]" style={{ color: "var(--fly-text-secondary)" }}>
                Sua operação não precisa começar sozinha. Nossa equipe ajuda a configurar o
                FlyControl e a colocar o cardápio no ar.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

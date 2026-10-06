import { Reveal } from "@/components/landing/primitivos";
import { CelularMarketplace } from "./CelularMarketplace";
import { PONTOS_MARKETPLACE } from "./dados";
import { CabecalhoDeSecao } from "./primitivos";

/**
 * Seção 04 — o marketplace FlyDelivery.
 *
 * Pouco texto: uma frase e cinco itens de uma linha. O celular conta o resto.
 * A frase central é a mais importante para o dono do restaurante — ele
 * cadastra uma vez só, no painel, e o aplicativo mostra igual.
 */
export function MarketplaceSection() {
  return (
    <section
      id="marketplace"
      aria-labelledby="fdp-marketplace-titulo"
      className="relative overflow-hidden px-5 py-20 sm:px-8 md:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 60% at 25% 50%, rgb(255 138 61 / 0.16), transparent 70%), var(--fdp-creme)",
        }}
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <CelularMarketplace />
        </Reveal>

        <div className="order-1 lg:order-2">
          <CabecalhoDeSecao
            id="fdp-marketplace-titulo"
            rotulo="Marketplace FlyDelivery"
            titulo="Seu negócio dentro do FlyDelivery."
            texto="Sua loja aparece no aplicativo FlyDelivery para quem está perto. Você cadastra uma vez no painel — e o app mostra igual."
          />

          <ul className="mt-10 flex flex-col">
            {PONTOS_MARKETPLACE.map((p, i) => (
              <Reveal
                as="li"
                key={p.titulo}
                atraso={60 * i}
                className="flex items-center gap-4 border-b py-4 last:border-b-0"
              >
                <span className="fdp-icone h-10 w-10 rounded-xl">
                  <p.icone className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold tracking-[-0.01em]">{p.titulo}</span>
                  <span className="block text-[15px]" style={{ color: "var(--fdp-texto-2)" }}>
                    {p.texto}
                  </span>
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

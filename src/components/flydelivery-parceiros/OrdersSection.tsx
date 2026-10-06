import { Reveal } from "@/components/landing/primitivos";
import { BENEFICIOS_PEDIDOS } from "./dados";
import { CabecalhoDeSecao } from "./primitivos";
import { QuadroDePedidos } from "./QuadroDePedidos";

/**
 * Seção 03 — gestão de pedidos.
 *
 * O quadro de pedidos é o coração do sistema, então ele aparece grande, com
 * os seis benefícios em frases de uma linha ao lado. Fundo cinza-claro para
 * separar da seção anterior sem precisar de linha nenhuma.
 */
export function OrdersSection() {
  return (
    <section
      id="produto"
      aria-labelledby="fdp-pedidos-titulo"
      className="px-5 py-20 sm:px-8 md:py-28"
      style={{ background: "var(--fdp-superficie)" }}
    >
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <CabecalhoDeSecao
            id="fdp-pedidos-titulo"
            rotulo="Gestão de pedidos"
            titulo={
              <>
                Pedidos chegando.
                <br />
                Operação acontecendo.
              </>
            }
            texto="Os pedidos do app, do seu site e do salão entram num quadro só, com o status de cada um em tempo real."
          />

          <ul className="mt-10 grid gap-x-6 gap-y-6 sm:grid-cols-2">
            {BENEFICIOS_PEDIDOS.map((b, i) => (
              <Reveal as="li" key={b.titulo} atraso={60 * i} className="flex gap-3.5">
                <span className="fdp-icone h-10 w-10 rounded-xl">
                  <b.icone className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[16px] font-bold tracking-[-0.01em]">{b.titulo}</h3>
                  <p
                    className="mt-1 text-[15px] leading-snug"
                    style={{ color: "var(--fdp-texto-2)" }}
                  >
                    {b.texto}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal atraso={150} className="relative">
          {/* Brilho laranja atrás do quadro: luz de cozinha, não neon. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10"
            style={{
              background: "radial-gradient(closest-side, rgb(255 138 61 / 0.22), transparent)",
            }}
          />
          <div className="relative">
            <QuadroDePedidos />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import { Reveal } from "@/components/landing/primitivos";
import { ECOSSISTEMA } from "./dados";
import { CabecalhoDeSecao } from "./primitivos";

/**
 * Seção 02 — o caminho do pedido, do celular do cliente até a entrega.
 *
 * Em vez de um fluxograma de setas e caixas, é uma trilha só: seis paradas
 * numa linha, com um brilho laranja correndo por ela — o pedido indo de uma
 * ponta à outra. No computador a trilha é deitada; no celular, em pé.
 *
 * A parada "FlyDelivery Parceiros" vem acesa: é onde o restaurante entra.
 */
export function EcosystemSection() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="fdp-ecossistema-titulo"
      className="relative px-5 py-20 sm:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <CabecalhoDeSecao
          id="fdp-ecossistema-titulo"
          rotulo="Ecossistema FlyDelivery"
          titulo="Tudo conectado em um só lugar."
          texto="O pedido nasce no app do cliente e chega pronto na sua operação — sem ninguém copiar nada à mão."
          centralizado
        />

        <Reveal atraso={120} className="relative mt-14 md:mt-20">
          {/* Quem é quem: os três primeiros passos acontecem com o cliente,
              os três últimos na sua loja. */}
          <div aria-hidden="true" className="mb-6 hidden grid-cols-2 gap-6 lg:grid">
            <LadoDaTrilha texto="Do lado do cliente" />
            <LadoDaTrilha texto="Do lado do restaurante" laranja />
          </div>

          <div className="relative">
            {/* A trilha deitada (computador): passa pelo centro dos ícones. */}
            <div
              aria-hidden="true"
              className="absolute left-[8.33%] right-[8.33%] top-7 hidden h-[3px] overflow-hidden rounded-full lg:block"
              style={{
                background:
                  "linear-gradient(90deg, var(--fdp-borda-forte), rgb(255 90 0 / 0.45) 50%, var(--fdp-borda-forte))",
              }}
            >
              <div className="fdp-cometa-x" />
            </div>

            {/* A trilha em pé (celular e tablet). */}
            <div
              aria-hidden="true"
              className="absolute bottom-7 left-7 top-7 w-[3px] -translate-x-1/2 overflow-hidden rounded-full lg:hidden"
              style={{
                background:
                  "linear-gradient(180deg, var(--fdp-borda-forte), rgb(255 90 0 / 0.45) 50%, var(--fdp-borda-forte))",
              }}
            >
              <div className="fdp-cometa-y" />
            </div>

            <ol className="relative grid gap-7 lg:grid-cols-6 lg:gap-4">
              {ECOSSISTEMA.map((etapa, i) => (
                <li
                  key={etapa.titulo}
                  className="flex items-start gap-5 lg:flex-col lg:items-center lg:gap-0 lg:text-center"
                >
                  <span
                    className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border bg-white"
                    style={
                      etapa.destaque
                        ? {
                            background: "var(--fdp-laranja)",
                            borderColor: "var(--fdp-laranja)",
                            color: "var(--fdp-sobre-laranja)",
                            boxShadow: "var(--fdp-brilho)",
                          }
                        : {
                            borderColor: "var(--fdp-borda)",
                            color: "var(--fdp-laranja-forte)",
                            boxShadow: "var(--fdp-sombra-md)",
                          }
                    }
                  >
                    <etapa.icone className="h-6 w-6" aria-hidden />
                    {etapa.destaque && (
                      <span
                        aria-hidden="true"
                        className="fdp-ao-vivo absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white"
                        style={{ background: "var(--fdp-laranja)" }}
                      />
                    )}
                  </span>

                  <div className="pt-1 lg:mt-5 lg:pt-0">
                    <p
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: "var(--fdp-texto-3)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3
                      className="mt-1 text-[17px] font-bold leading-snug tracking-[-0.02em]"
                      style={{
                        color: etapa.destaque ? "var(--fdp-laranja-texto)" : "var(--fdp-texto)",
                      }}
                    >
                      {etapa.titulo}
                    </h3>
                    <p
                      className="mt-1.5 text-[15px] leading-relaxed"
                      style={{ color: "var(--fdp-texto-2)" }}
                    >
                      {etapa.texto}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LadoDaTrilha({ texto, laranja = false }: { texto: string; laranja?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-px flex-1"
        style={{ background: laranja ? "var(--fdp-laranja-borda)" : "var(--fdp-borda)" }}
      />
      <span
        className="text-xs font-semibold uppercase tracking-[0.16em]"
        style={{ color: laranja ? "var(--fdp-laranja-texto)" : "var(--fdp-texto-3)" }}
      >
        {texto}
      </span>
      <span
        className="h-px flex-1"
        style={{ background: laranja ? "var(--fdp-laranja-borda)" : "var(--fdp-borda)" }}
      />
    </div>
  );
}

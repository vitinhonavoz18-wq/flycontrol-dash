import { Reveal } from "@/components/landing/primitivos";
import { FUNCIONALIDADES } from "./dados";
import { CabecalhoDeSecao, SeloEmBreve } from "./primitivos";

/**
 * Seção 05 — os recursos, um cartão para cada.
 *
 * Cada cartão tem ícone, nome e UMA frase. Quem quer detalhe entra no
 * sistema; aqui a pessoa só precisa saber que existe.
 *
 * Dois cartões são maiores (pedidos e marketplace): são os que fazem o
 * restaurante vender. No computador a grade fica 4 × 3 certinha; no celular,
 * um embaixo do outro.
 */
export function FeaturesSection() {
  return (
    <section
      id="recursos"
      aria-labelledby="fdp-recursos-titulo"
      className="px-5 py-20 sm:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <CabecalhoDeSecao
          id="fdp-recursos-titulo"
          rotulo="Recursos"
          titulo="Tudo o que a sua operação precisa."
          texto="Do cardápio ao relatório do fim do dia, num sistema só."
          centralizado
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-16">
          {FUNCIONALIDADES.map((f, i) => (
            <Reveal
              as="li"
              key={f.titulo}
              atraso={40 * (i % 4)}
              className={f.grande ? "sm:col-span-2" : ""}
            >
              <article
                className={`fdp-cartao fdp-cartao-vivo relative flex h-full flex-col overflow-hidden ${
                  f.grande ? "p-7" : "p-6"
                }`}
              >
                {f.grande && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
                    style={{
                      background:
                        "radial-gradient(closest-side, rgb(255 138 61 / 0.22), transparent)",
                    }}
                  />
                )}
                <div className="relative flex items-start justify-between gap-3">
                  <span className={`fdp-icone ${f.grande ? "h-12 w-12" : ""}`}>
                    <f.icone className={f.grande ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
                  </span>
                  {f.emBreve && <SeloEmBreve />}
                </div>
                <h3
                  className={`relative mt-5 font-bold tracking-[-0.02em] ${
                    f.grande ? "text-[22px]" : "text-[17px]"
                  }`}
                >
                  {f.titulo}
                </h3>
                <p
                  className={`relative mt-1.5 leading-relaxed ${f.grande ? "max-w-sm text-[16px]" : "text-[15px]"}`}
                  style={{ color: "var(--fdp-texto-2)" }}
                >
                  {f.texto}
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

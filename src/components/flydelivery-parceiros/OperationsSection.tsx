import { ETAPAS_DA_OPERACAO } from "./dados";
import { useNaTela } from "./ganchos";
import { CabecalhoDeSecao } from "./primitivos";

/**
 * Seção 06 — a operação, do pedido ao cliente.
 *
 * Fundo azul-marinho: é a "virada" visual da página, o momento em que ela
 * sai do branco. Quando a seção aparece na tela, a linha laranja enche da
 * esquerda para a direita e as cinco etapas acendem uma depois da outra —
 * como o pedido andando pelo quadro.
 *
 * Acontece uma vez só (não fica repetindo a cada rolada) e é feito com
 * transição do navegador: o código só troca uma marca no elemento quando a
 * seção aparece. Quem pediu menos movimento vê tudo já aceso.
 */
export function OperationsSection() {
  const [alvo, visivel] = useNaTela<HTMLDivElement>("0px 0px -25% 0px");
  const passo = 260;

  return (
    <section
      id="operacao"
      aria-labelledby="fdp-operacao-titulo"
      className="relative overflow-hidden px-5 py-20 sm:px-8 md:py-28"
      style={{ background: "var(--fdp-marinho)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 60% at 85% 0%, rgb(255 90 0 / 0.22), transparent 70%), radial-gradient(40% 50% at 0% 100%, rgb(59 92 180 / 0.25), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1240px]">
        <CabecalhoDeSecao
          id="fdp-operacao-titulo"
          rotulo="Operação"
          titulo="Cada pedido, do começo ao fim."
          texto="O status anda no painel e o cliente acompanha pelo app — sem ninguém precisar ligar para perguntar."
          escuro
        />

        <div ref={alvo} data-ativo={visivel ? "sim" : "nao"} className="relative mt-14 md:mt-20">
          {/* Linha deitada (computador) */}
          <div
            aria-hidden="true"
            className="absolute left-[10%] right-[10%] top-7 hidden h-[3px] rounded-full lg:block"
            style={{ background: "rgb(255 255 255 / 0.12)" }}
          >
            <div
              className="fdp-progresso-x h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, var(--fdp-laranja), var(--fdp-laranja-claro))",
              }}
            />
          </div>

          {/* Linha em pé (celular e tablet) */}
          <div
            aria-hidden="true"
            className="absolute bottom-7 left-7 top-7 w-[3px] -translate-x-1/2 rounded-full lg:hidden"
            style={{ background: "rgb(255 255 255 / 0.12)" }}
          >
            <div
              className="fdp-progresso-y h-full w-full rounded-full"
              style={{
                background: "linear-gradient(180deg, var(--fdp-laranja), var(--fdp-laranja-claro))",
              }}
            />
          </div>

          <ol className="relative grid gap-8 lg:grid-cols-5 lg:gap-6">
            {ETAPAS_DA_OPERACAO.map((etapa, i) => (
              <li
                key={etapa.titulo}
                className="fdp-etapa flex items-start gap-5 lg:flex-col lg:items-center lg:gap-0 lg:text-center"
                style={{ "--fdp-atraso": `${i * passo}ms` } as React.CSSProperties}
              >
                <span
                  className="fdp-etapa-icone grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
                  style={{ "--fdp-atraso": `${i * passo + 200}ms` } as React.CSSProperties}
                >
                  <etapa.icone className="h-6 w-6" aria-hidden />
                </span>
                <div className="pt-1 lg:mt-5 lg:pt-0">
                  <p
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: "rgb(255 255 255 / 0.55)" }}
                  >
                    Etapa {i + 1}
                  </p>
                  <h3 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-white">
                    {etapa.titulo}
                  </h3>
                  <p
                    className="mt-1.5 text-[15px] leading-relaxed"
                    style={{ color: "rgb(255 255 255 / 0.72)" }}
                  >
                    {etapa.texto}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

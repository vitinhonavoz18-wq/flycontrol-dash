import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Link2, Repeat, Wallet } from "lucide-react";
import { TopoPublico } from "@/components/afiliados/portal/Casca";
import { useAuth } from "@/lib/auth";
import { useRegrasPublicas } from "@/lib/afiliados/portal";
import { porcentagemDeBps, reais } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/affiliates/")({ component: Apresentacao });

/**
 * A porta de entrada do programa. Os números (porcentagem, prazo, saque
 * mínimo) vêm do banco — se a equipe mudar a regra, a página muda junto.
 * Enquanto carregam, os números simplesmente não aparecem: melhor um texto
 * sem número do que um número errado.
 */
function Apresentacao() {
  const { user } = useAuth();
  const { data: regras } = useRegrasPublicas();

  const comissao = regras ? porcentagemDeBps(regras.comissao_bps) : null;
  const fechado = regras && !regras.programa_ativo;

  return (
    <>
      <TopoPublico
        direita={
          user ? (
            <Link
              to="/affiliates/dashboard"
              className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-black"
            >
              Meu painel
            </Link>
          ) : (
            <Link
              to="/affiliates/login"
              className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-white hover:bg-white/5"
            >
              Entrar
            </Link>
          )
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <section className="pt-8 sm:pt-16">
          <span className="fly-label text-[#ff8a3d]">Programa de parceiros</span>
          <h1 className="fly-headline mt-4 max-w-4xl">
            Indique o FlyControl.
            <br />
            <span className="text-white/45">Ganhe todo mês.</span>
          </h1>
          <p className="fly-body mt-6 max-w-xl text-white/60">
            Você indica restaurantes, eles usam o FlyControl, e você recebe{" "}
            {comissao ? (
              <strong className="font-semibold text-white">{comissao} recorrente</strong>
            ) : (
              "comissão recorrente"
            )}{" "}
            sobre o que cada cliente paga — enquanto ele continuar pagando.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {fechado ? (
              <p className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/60">
                O programa está fechado para novos cadastros no momento.
              </p>
            ) : (
              <Link
                to="/affiliates/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff5a00] px-6 text-sm font-semibold text-white hover:bg-[#ff7a2b]"
              >
                Quero ser parceiro <ArrowRight className="size-4" />
              </Link>
            )}
            <Link
              to="/affiliates/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white hover:bg-white/5"
            >
              Já sou parceiro
            </Link>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-3" aria-label="Como funciona">
          {[
            {
              icone: <Link2 className="size-5" />,
              titulo: "1. Pegue seu link",
              texto: "Depois do cadastro aprovado, você recebe um link e um código só seus.",
            },
            {
              icone: <Repeat className="size-5" />,
              titulo: "2. Indique restaurantes",
              texto: regras
                ? `Quem clicar no seu link e criar a conta em até ${regras.dias_do_link} dias fica ligado a você.`
                : "Quem clicar no seu link e criar a conta fica ligado a você.",
            },
            {
              icone: <Wallet className="size-5" />,
              titulo: "3. Receba por Pix",
              texto: regras
                ? `A comissão libera ${regras.dias_para_liberar} dias depois do pagamento do cliente. Saque a partir de ${reais(regras.saque_minimo_cents)}.`
                : "A comissão libera alguns dias depois do pagamento do cliente, e você saca por Pix.",
            },
          ].map((passo) => (
            <div
              key={passo.titulo}
              className="rounded-[18px] border border-white/[0.08] bg-[#080808] p-5 sm:p-6"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#ff5a00]/12 text-[#ff8a3d]">
                {passo.icone}
              </span>
              <h2 className="mt-4 text-lg font-medium">{passo.titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/55">{passo.texto}</p>
            </div>
          ))}
        </section>

        <section
          id="regras"
          className="mt-16 rounded-[24px] border border-white/[0.08] bg-[#080808] p-5 sm:mt-24 sm:p-8"
        >
          <h2 className="fly-subheading">Regras do programa</h2>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/65">
            <li>
              • A comissão é calculada sobre o que o cliente indicado{" "}
              <strong className="text-white">de fato paga</strong> ao FlyControl. Cobrança não paga
              não gera comissão.
            </li>
            <li>
              • Pagamento devolvido ao cliente (estorno) cancela a comissão daquele pagamento.
            </li>
            <li>
              • Cada restaurante tem um parceiro só: vale o primeiro link válido que a pessoa
              clicou.
            </li>
            <li>• Não vale indicar a si mesmo nem uma loja que você mesmo administra.</li>
            {regras?.aprovacao_manual ? (
              <li>
                • Todo cadastro de parceiro passa por uma análise da equipe antes de liberar o link.
              </li>
            ) : null}
            <li>• O saque é feito por Pix, na chave cadastrada no seu painel.</li>
          </ul>
        </section>
      </main>
    </>
  );
}

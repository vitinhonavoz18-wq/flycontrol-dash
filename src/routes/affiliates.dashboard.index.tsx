import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  BadgeDollarSign,
  Clock3,
  Percent,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { CartaoDoLink } from "@/components/afiliados/portal/CartaoDoLink";
import { GraficosDoAfiliado } from "@/components/afiliados/portal/Graficos";
import {
  CartaoNumero,
  Carregando,
  Erro,
  TituloDaPagina,
} from "@/components/afiliados/portal/Pecas";
import { usePerfil } from "@/components/afiliados/portal/perfilContexto";
import { useResumoDoAfiliado } from "@/lib/afiliados/portal";
import {
  mensagemDeErro,
  porcentagemDeBps,
  reais,
  taxaDeConversao,
} from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/affiliates/dashboard/")({ component: VisaoGeral });

function VisaoGeral() {
  const perfil = usePerfil();
  const resumo = useResumoDoAfiliado();
  const primeiroNome = perfil.nome.split(" ")[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      <TituloDaPagina
        titulo={`Olá, ${primeiroNome}`}
        texto="Seu desempenho como parceiro FlyControl."
      />

      <CartaoDoLink codigo={perfil.codigo} />

      {resumo.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Carregando key={i} linhas={1} altura="h-[118px]" />
          ))}
        </div>
      ) : resumo.isError ? (
        <Erro mensagem={mensagemDeErro(resumo.error)} tentarDeNovo={() => resumo.refetch()} />
      ) : resumo.data ? (
        <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <CartaoNumero
            rotulo="Saldo disponível"
            valor={reais(resumo.data.disponivel_cents)}
            detalhe="Pronto para sacar"
            icone={<Wallet className="size-4" />}
            tom="verde"
          />
          <CartaoNumero
            rotulo="Saldo pendente"
            valor={reais(resumo.data.pendente_cents)}
            detalhe={`Libera ${perfil.dias_para_liberar} dias após o pagamento`}
            icone={<Clock3 className="size-4" />}
            tom="laranja"
          />
          <CartaoNumero
            rotulo="Total recebido"
            valor={reais(resumo.data.recebido_cents)}
            detalhe={
              resumo.data.solicitado_cents > 0
                ? `${reais(resumo.data.solicitado_cents)} em saque`
                : "Já pago na sua conta"
            }
            icone={<ArrowDownToLine className="size-4" />}
          />
          <CartaoNumero
            rotulo="Receita gerada"
            valor={reais(resumo.data.receita_gerada_cents)}
            detalhe="Pago pelos seus indicados"
            icone={<TrendingUp className="size-4" />}
            tom="azul"
          />
          <CartaoNumero
            rotulo="Clientes ativos"
            valor={resumo.data.clientes_ativos}
            detalhe="Pagando hoje"
            icone={<Store className="size-4" />}
            tom="verde"
          />
          <CartaoNumero
            rotulo="Total de indicações"
            valor={resumo.data.total_indicacoes}
            detalhe="Lojas criadas pelo seu link"
            icone={<Users className="size-4" />}
            tom="azul"
          />
          <CartaoNumero
            rotulo="Taxa de conversão"
            valor={taxaDeConversao(resumo.data.conversao_milesimos)}
            detalhe={`${resumo.data.cliques} ${resumo.data.cliques === 1 ? "visita" : "visitas"} pelo link`}
            icone={<Percent className="size-4" />}
          />
          <CartaoNumero
            rotulo="Minha comissão"
            valor={porcentagemDeBps(resumo.data.comissao_bps)}
            detalhe={
              resumo.data.comissao_meses
                ? `Recorrente por ${resumo.data.comissao_meses} meses`
                : "Recorrente, enquanto o cliente pagar"
            }
            icone={<BadgeDollarSign className="size-4" />}
            tom="laranja"
          />
        </section>
      ) : null}

      <GraficosDoAfiliado />
    </div>
  );
}

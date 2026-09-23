import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  Store,
  TrendingUp,
  UserCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { GraficosAdmin } from "@/components/afiliados/admin/GraficosAdmin";
import { Carregando, Erro, Kpi } from "@/components/afiliados/admin/PecasAdmin";
import { useResumoAdmin } from "@/lib/afiliados/admin";
import { mensagemDeErro, reais } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/_app/admin/affiliates/")({ component: VisaoGeralAdmin });

function VisaoGeralAdmin() {
  const resumo = useResumoAdmin();

  if (resumo.isLoading) return <Carregando linhas={6} />;
  if (resumo.isError || !resumo.data) {
    return <Erro mensagem={mensagemDeErro(resumo.error)} tentarDeNovo={() => resumo.refetch()} />;
  }
  const r = resumo.data;

  return (
    <div className="space-y-6">
      {r.saques_em_analise > 0 || r.afiliados_pendentes > 0 || r.alertas_30_dias > 0 ? (
        <div className="flex flex-wrap gap-2">
          {r.afiliados_pendentes > 0 ? (
            <Link
              to="/admin/affiliates/partners"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400"
            >
              {r.afiliados_pendentes}{" "}
              {r.afiliados_pendentes === 1 ? "cadastro aguardando" : "cadastros aguardando"}{" "}
              aprovação
            </Link>
          ) : null}
          {r.saques_em_analise > 0 ? (
            <Link
              to="/admin/affiliates/withdrawals"
              className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary"
            >
              {r.saques_em_analise}{" "}
              {r.saques_em_analise === 1 ? "saque aguardando" : "saques aguardando"} análise
            </Link>
          ) : null}
          {r.alertas_30_dias > 0 ? (
            <Link
              to="/admin/affiliates/audit"
              className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
            >
              <AlertTriangle className="h-4 w-4" /> {r.alertas_30_dias}{" "}
              {r.alertas_30_dias === 1 ? "alerta" : "alertas"} de atividade suspeita (30 dias)
            </Link>
          ) : null}
        </div>
      ) : null}

      <section
        aria-label="Números do programa"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5"
      >
        <Kpi rotulo="Afiliados ativos" valor={r.afiliados_ativos} icone={UserCheck} />
        <Kpi
          rotulo="Afiliados pendentes"
          valor={r.afiliados_pendentes}
          icone={UserPlus}
          destaque={r.afiliados_pendentes > 0}
        />
        <Kpi rotulo="Clientes indicados" valor={r.clientes_indicados} icone={Store} />
        <Kpi rotulo="Clientes ativos indicados" valor={r.clientes_ativos} icone={CheckCircle2} />
        <Kpi
          rotulo="Receita gerada por afiliados"
          valor={reais(r.receita_gerada_cents)}
          icone={TrendingUp}
        />
        <Kpi
          rotulo="Comissões pendentes"
          valor={reais(r.comissoes_pendentes_cents)}
          icone={Clock3}
        />
        <Kpi
          rotulo="Comissões disponíveis"
          valor={reais(r.comissoes_disponiveis_cents)}
          icone={Wallet}
          detalhe={
            r.comissoes_solicitadas_cents > 0
              ? `+ ${reais(r.comissoes_solicitadas_cents)} em saque`
              : undefined
          }
        />
        <Kpi
          rotulo="Comissões pagas"
          valor={reais(r.comissoes_pagas_cents)}
          icone={BadgeDollarSign}
        />
        <Kpi
          rotulo="Saques aguardando análise"
          valor={r.saques_em_analise}
          detalhe={r.saques_em_analise > 0 ? reais(r.saques_em_analise_cents) : undefined}
          icone={ArrowDownToLine}
          destaque={r.saques_em_analise > 0}
        />
        <Kpi
          rotulo="Aprovados, aguardando pagamento"
          valor={r.saques_a_pagar}
          detalhe={r.saques_a_pagar > 0 ? reais(r.saques_a_pagar_cents) : undefined}
          icone={ArrowDownToLine}
          destaque={r.saques_a_pagar > 0}
        />
      </section>

      <GraficosAdmin />
    </div>
  );
}

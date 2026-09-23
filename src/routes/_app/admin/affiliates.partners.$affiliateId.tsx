import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Carregando,
  ConfirmarAcao,
  Erro,
  Kpi,
  SeloDoAfiliado,
} from "@/components/afiliados/admin/PecasAdmin";
import {
  ListaDeEventos,
  TabelaDeComissoes,
  TabelaDeIndicacoes,
  TabelaDeSaques,
} from "@/components/afiliados/admin/Tabelas";
import {
  CHAVE_ADMIN,
  definirPorcentagem,
  definirSituacaoDoAfiliado,
  useFichaDoAfiliado,
  type FichaDoAfiliado,
} from "@/lib/afiliados/admin";
import { bpsParaCampo, porcentagemParaBps } from "@/lib/afiliados/adminRotulos";
import {
  TIPOS_DE_PIX,
  dataCurta,
  linkParaExibir,
  mensagemDeErro,
  porcentagemDeBps,
  reais,
} from "@/lib/afiliados/validacao";
import { formatPhone } from "@/lib/signup/validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/affiliates/partners/$affiliateId")({
  component: FichaDoAfiliadoAdmin,
});

type AcaoDeSituacao = {
  para: "active" | "suspended" | "blocked";
  titulo: string;
  texto: string;
  perigosa: boolean;
};

function acoesPossiveis(a: FichaDoAfiliado): AcaoDeSituacao[] {
  const acoes: AcaoDeSituacao[] = [];
  if (a.status === "pending") {
    acoes.push({
      para: "active",
      titulo: "Aprovar afiliado",
      texto:
        "O link dele passa a registrar indicações a partir de agora, e o painel completo é liberado.",
      perigosa: false,
    });
  }
  if (a.status === "suspended" || a.status === "blocked") {
    acoes.push({
      para: "active",
      titulo: "Reativar afiliado",
      texto:
        "O link volta a registrar indicações e as comissões pendentes voltam a liberar. Faturas pagas enquanto esteve inativo não geram comissão retroativa.",
      perigosa: false,
    });
  }
  if (a.status === "active") {
    acoes.push({
      para: "suspended",
      titulo: "Suspender afiliado",
      texto:
        "Enquanto suspenso: o link não registra novas indicações, faturas pagas pelos clientes dele não geram comissão, comissões pendentes não liberam e ele não pode pedir saque. Nada do histórico é apagado.",
      perigosa: true,
    });
  }
  if (a.status !== "blocked") {
    acoes.push({
      para: "blocked",
      titulo: "Bloquear afiliado",
      texto:
        "Mesmo efeito da suspensão, e ele perde o acesso ao painel de parceiro. O histórico financeiro continua guardado. Pode ser reativado depois, se necessário.",
      perigosa: true,
    });
  }
  return acoes;
}

type Aba = "comissoes" | "saques" | "indicacoes" | "eventos";

function FichaDoAfiliadoAdmin() {
  const { affiliateId } = Route.useParams();
  const ficha = useFichaDoAfiliado(affiliateId);
  const qc = useQueryClient();
  const [acao, setAcao] = useState<AcaoDeSituacao | null>(null);
  const [aba, setAba] = useState<Aba>("comissoes");
  const [taxaDigitada, setTaxaDigitada] = useState<string | null>(null);
  const [confirmarTaxa, setConfirmarTaxa] = useState<{ bps: number | null } | null>(null);

  if (ficha.isLoading) return <Carregando linhas={6} />;
  if (ficha.isError)
    return <Erro mensagem={mensagemDeErro(ficha.error)} tentarDeNovo={() => ficha.refetch()} />;
  if (!ficha.data) {
    return (
      <div className="space-y-3">
        <p>Afiliado não encontrado.</p>
        <Link to="/admin/affiliates/partners" className="text-primary hover:underline">
          Voltar para a lista
        </Link>
      </div>
    );
  }
  const a = ficha.data;
  const recarregar = () => qc.invalidateQueries({ queryKey: CHAVE_ADMIN });
  const campoTaxa = taxaDigitada ?? bpsParaCampo(a.comissao_bps);
  const bpsDigitado = porcentagemParaBps(campoTaxa);
  const tipoDoPix = TIPOS_DE_PIX.find((t) => t.valor === a.pix_tipo)?.rotulo;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/affiliates/partners"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Afiliados
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold">{a.nome}</h2>
            <SeloDoAfiliado status={a.status} />
            {a.alertas > 0 ? (
              <button
                type="button"
                onClick={() => setAba("eventos")}
                className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-400"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> {a.alertas}{" "}
                {a.alertas === 1 ? "alerta" : "alertas"}
              </button>
            ) : null}
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="min-w-0 break-all">{a.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Telefone</dt>
              <dd>{a.telefone ? formatPhone(a.telefone) : "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Código</dt>
              <dd className="font-mono font-semibold">{a.codigo}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Link</dt>
              <dd className="min-w-0 break-all font-mono text-xs leading-5">
                {linkParaExibir(a.codigo)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Pix</dt>
              <dd className="min-w-0 break-all">
                {a.pix_chave ? (
                  <>
                    {tipoDoPix} · <span className="font-mono">{a.pix_chave}</span>
                  </>
                ) : (
                  "não cadastrado"
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Entrada</dt>
              <dd>
                {dataCurta(a.criado_em)}
                {a.termos_versao ? (
                  <span className="text-muted-foreground"> · regras {a.termos_versao}</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2">
          {acoesPossiveis(a).map((ac) => (
            <Button
              key={ac.titulo}
              variant={ac.perigosa ? "outline" : "default"}
              className={cn(ac.perigosa && "text-destructive")}
              onClick={() => setAcao(ac)}
            >
              {ac.titulo.replace(" afiliado", "")}
            </Button>
          ))}
        </div>
      </div>

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7"
      >
        <Kpi
          rotulo="Total de indicações"
          valor={a.indicacoes}
          detalhe={`${a.cliques} visitas pelo link`}
          icone={Store}
        />
        <Kpi rotulo="Clientes ativos" valor={a.clientes_ativos} icone={CheckCircle2} />
        <Kpi rotulo="Receita gerada" valor={reais(a.receita_cents)} icone={TrendingUp} />
        <Kpi rotulo="Comissão acumulada" valor={reais(a.acumulado_cents)} icone={BadgeDollarSign} />
        <Kpi rotulo="Pendente" valor={reais(a.pendente_cents)} icone={Clock3} />
        <Kpi
          rotulo="Disponível"
          valor={reais(a.disponivel_cents)}
          detalhe={a.solicitado_cents > 0 ? `+ ${reais(a.solicitado_cents)} em saque` : undefined}
          icone={Wallet}
        />
        <Kpi rotulo="Pago" valor={reais(a.pago_cents)} icone={BadgeDollarSign} />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Percentual de comissão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Atual: <strong className="text-foreground">{porcentagemDeBps(a.comissao_bps)}</strong>{" "}
            {a.comissao_propria_bps === null
              ? `(padrão do programa)`
              : `(individual; o padrão do programa é ${porcentagemDeBps(a.comissao_padrao_bps)})`}
            . Mudar aqui vale só para as próximas comissões — as já criadas mantêm o percentual do
            dia em que nasceram.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="taxa">Percentual individual (%)</Label>
              <Input
                id="taxa"
                inputMode="decimal"
                value={campoTaxa}
                onChange={(e) => setTaxaDigitada(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              disabled={bpsDigitado === null || bpsDigitado === a.comissao_propria_bps}
              onClick={() => setConfirmarTaxa({ bps: bpsDigitado })}
            >
              Salvar percentual
            </Button>
            {a.comissao_propria_bps !== null ? (
              <Button variant="outline" onClick={() => setConfirmarTaxa({ bps: null })}>
                Voltar ao padrão ({porcentagemDeBps(a.comissao_padrao_bps)})
              </Button>
            ) : null}
          </div>
          {bpsDigitado === null ? (
            <p className="text-xs text-destructive">
              Use um número de 0 a 100, com até duas casas (ex.: 15 ou 12,5).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section>
        <nav className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex w-max gap-1 rounded-xl bg-muted/50 p-1">
            {(
              [
                ["comissoes", "Comissões"],
                ["saques", "Saques"],
                ["indicacoes", "Indicações"],
                ["eventos", "Eventos"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                aria-current={aba === id ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                  aba === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </nav>
        {aba === "comissoes" ? (
          <TabelaDeComissoes status="" afiliadoId={a.id} esconderAfiliado />
        ) : null}
        {aba === "saques" ? <TabelaDeSaques status="" afiliadoId={a.id} esconderAfiliado /> : null}
        {aba === "indicacoes" ? (
          <TabelaDeIndicacoes situacao="" afiliadoId={a.id} esconderAfiliado />
        ) : null}
        {aba === "eventos" ? <ListaDeEventos tipo="" afiliadoId={a.id} esconderAfiliado /> : null}
      </section>

      <ConfirmarAcao
        aberto={Boolean(acao)}
        aoFechar={() => setAcao(null)}
        titulo={acao?.titulo ?? ""}
        perigosa={acao?.perigosa}
        rotuloDoBotao={acao?.titulo.split(" ")[0] ?? "Confirmar"}
        descricao={
          acao ? (
            <>
              <p>
                <strong>{a.nome}</strong> ({a.codigo})
              </p>
              <p>{acao.texto}</p>
            </>
          ) : null
        }
        motivo={
          acao
            ? acao.perigosa
              ? {
                  rotulo: "Motivo",
                  minimo: 5,
                  obrigatorio: true,
                  dica: "Obrigatório. Fica na auditoria.",
                }
              : { rotulo: "Observação (opcional)", minimo: 0, obrigatorio: false }
            : undefined
        }
        aoConfirmar={async ({ motivo }) => {
          if (!acao) return;
          try {
            await definirSituacaoDoAfiliado(a.id, acao.para, motivo || null);
            toast.success("Situação atualizada.");
            await recarregar();
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />

      <ConfirmarAcao
        aberto={Boolean(confirmarTaxa)}
        aoFechar={() => setConfirmarTaxa(null)}
        titulo="Alterar percentual"
        rotuloDoBotao="Alterar"
        descricao={
          confirmarTaxa ? (
            <>
              <p>
                {porcentagemDeBps(a.comissao_bps)} →{" "}
                <strong>
                  {confirmarTaxa.bps === null
                    ? `${porcentagemDeBps(a.comissao_padrao_bps)} (padrão do programa)`
                    : porcentagemDeBps(confirmarTaxa.bps)}
                </strong>{" "}
                para {a.nome}.
              </p>
              <p>
                Vale só para comissões criadas daqui para frente. Nenhuma comissão antiga é
                recalculada.
              </p>
            </>
          ) : null
        }
        aoConfirmar={async () => {
          if (!confirmarTaxa) return;
          try {
            await definirPorcentagem(a.id, confirmarTaxa.bps);
            toast.success("Percentual alterado.");
            setTaxaDigitada(null);
            await recarregar();
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Carregando,
  ConfirmarAcao,
  Erro,
  SeletorAdmin,
} from "@/components/afiliados/admin/PecasAdmin";
import {
  CHAVE_ADMIN,
  salvarConfiguracoes,
  useConfiguracoesAdmin,
  type BaseDaComissao,
  type ConfiguracoesAdmin,
} from "@/lib/afiliados/admin";
import {
  NOME_DA_BASE,
  bpsParaCampo,
  centavosParaCampo,
  diasDoTexto,
  diasParaCampo,
  porcentagemParaBps,
  reaisParaCentavos,
} from "@/lib/afiliados/adminRotulos";
import { listaDeDias, mensagemDeErro, porcentagemDeBps, reais } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/_app/admin/affiliates/settings")({
  component: ConfiguracoesDoPrograma,
});

type Formulario = {
  programaAtivo: boolean;
  comissao: string;
  vitalicia: boolean;
  meses: string;
  diasParaLiberar: string;
  saqueMinimo: string;
  linkSemPrazo: boolean;
  diasDoLink: string;
  diasDeRepasse: string;
  base: BaseDaComissao;
  aprovacaoManual: boolean;
};

function doBanco(c: ConfiguracoesAdmin): Formulario {
  return {
    programaAtivo: c.programa_ativo,
    comissao: bpsParaCampo(c.comissao_bps),
    vitalicia: c.duracao_meses === null,
    meses: c.duracao_meses === null ? "12" : String(c.duracao_meses),
    diasParaLiberar: String(c.dias_para_liberar),
    saqueMinimo: centavosParaCampo(c.saque_minimo_cents),
    linkSemPrazo: c.dias_do_link === null,
    diasDoLink: c.dias_do_link === null ? "30" : String(c.dias_do_link),
    diasDeRepasse: diasParaCampo(c.dias_de_repasse ?? []),
    base: c.base,
    aprovacaoManual: c.aprovacao_manual,
  };
}

function inteiro(texto: string, min: number, max: number): number | null {
  if (!/^\d{1,4}$/.test(texto.trim())) return null;
  const n = Number(texto);
  return n >= min && n <= max ? n : null;
}

/**
 * As regras do programa. Nada muda sem uma janela de confirmação que lista
 * o antes e o depois, e o banco guarda a mesma lista na auditoria.
 *
 * Mudança de regra NUNCA mexe no passado: comissão já criada guarda a
 * porcentagem e o prazo com que nasceu.
 */
function ConfiguracoesDoPrograma() {
  const consulta = useConfiguracoesAdmin();
  const qc = useQueryClient();
  const [form, setForm] = useState<Formulario | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  if (consulta.isLoading) return <Carregando linhas={6} />;
  if (consulta.isError || !consulta.data) {
    return (
      <Erro mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />
    );
  }
  const atual = consulta.data;
  const f = form ?? doBanco(atual);
  const mudar = (parcial: Partial<Formulario>) => setForm({ ...f, ...parcial });

  const comissaoBps = porcentagemParaBps(f.comissao);
  const meses = f.vitalicia ? null : inteiro(f.meses, 1, 120);
  const dias = inteiro(f.diasParaLiberar, 0, 365);
  const saque = reaisParaCentavos(f.saqueMinimo);
  const janela = f.linkSemPrazo ? null : inteiro(f.diasDoLink, 1, 365);
  const diasDeRepasse = diasDoTexto(f.diasDeRepasse);

  const erros = {
    comissao: comissaoBps === null ? "De 0 a 100, com até duas casas (ex.: 15 ou 12,5)." : null,
    meses: !f.vitalicia && meses === null ? "De 1 a 120 meses." : null,
    dias: dias === null ? "De 0 a 365 dias." : null,
    saque: saque === null || saque > 10000000 ? "Valor em reais, ex.: 100,00." : null,
    janela: !f.linkSemPrazo && janela === null ? "De 1 a 365 dias." : null,
    repasse:
      diasDeRepasse === null ? "De 1 a 4 dias do mês, cada um de 1 a 28 (ex.: 10, 20)." : null,
  };
  const valido = Object.values(erros).every((e) => e === null);

  const novo = {
    programaAtivo: f.programaAtivo,
    comissaoBps: comissaoBps ?? 0,
    duracaoMeses: meses,
    diasParaLiberar: dias ?? 0,
    saqueMinimoCents: saque ?? 0,
    diasDoLink: janela,
    base: f.base,
    aprovacaoManual: f.aprovacaoManual,
    diasDeRepasse: diasDeRepasse ?? [],
  };
  const textoDaJanela = (d: number | null) => (d === null ? "sem prazo" : `${d} dias`);

  const mudancas: string[] = [];
  if (valido) {
    if (novo.programaAtivo !== atual.programa_ativo)
      mudancas.push(
        `Programa: ${atual.programa_ativo ? "ativo" : "desligado"} → ${novo.programaAtivo ? "ativo" : "desligado"}`,
      );
    if (novo.comissaoBps !== atual.comissao_bps)
      mudancas.push(
        `Comissão padrão: ${porcentagemDeBps(atual.comissao_bps)} → ${porcentagemDeBps(novo.comissaoBps)}`,
      );
    if (novo.duracaoMeses !== atual.duracao_meses)
      mudancas.push(
        `Duração: ${atual.duracao_meses === null ? "enquanto o cliente pagar" : `${atual.duracao_meses} meses`} → ${
          novo.duracaoMeses === null ? "enquanto o cliente pagar" : `${novo.duracaoMeses} meses`
        }`,
      );
    if (novo.diasParaLiberar !== atual.dias_para_liberar)
      mudancas.push(`Liberação: ${atual.dias_para_liberar} → ${novo.diasParaLiberar} dias`);
    if (novo.saqueMinimoCents !== atual.saque_minimo_cents)
      mudancas.push(
        `Repasse mínimo: ${reais(atual.saque_minimo_cents)} → ${reais(novo.saqueMinimoCents)}`,
      );
    if (novo.diasDoLink !== atual.dias_do_link)
      mudancas.push(
        `Janela do link: ${textoDaJanela(atual.dias_do_link)} → ${textoDaJanela(novo.diasDoLink)}`,
      );
    if (diasParaCampo(novo.diasDeRepasse) !== diasParaCampo(atual.dias_de_repasse ?? []))
      mudancas.push(
        `Dias de repasse: ${listaDeDias(atual.dias_de_repasse)} → ${listaDeDias(novo.diasDeRepasse)}`,
      );
    if (novo.base !== atual.base)
      mudancas.push(`Base: ${NOME_DA_BASE[atual.base]} → ${NOME_DA_BASE[novo.base]}`);
    if (novo.aprovacaoManual !== atual.aprovacao_manual)
      mudancas.push(
        `Aprovação manual: ${atual.aprovacao_manual ? "sim" : "não"} → ${novo.aprovacaoManual ? "sim" : "não"}`,
      );
  }

  const Erro1 = ({ texto }: { texto: string | null }) =>
    texto ? <p className="text-xs text-destructive">{texto}</p> : null;

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Programa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="cfg-ativo">Programa de afiliados ativo</Label>
              <p className="text-xs text-muted-foreground">
                Desligado: links param de registrar indicações, novos cadastros ficam fechados e
                faturas pagas não geram comissão nova. O saldo que já foi ganho continua sendo
                repassado nos dias de repasse.
              </p>
            </div>
            <Switch
              id="cfg-ativo"
              checked={f.programaAtivo}
              onCheckedChange={(v) => mudar({ programaAtivo: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="cfg-aprovacao">Aprovação manual de novos afiliados</Label>
              <p className="text-xs text-muted-foreground">
                Ligado: todo cadastro fica "em análise" até a equipe aprovar. Desligado: o cadastro
                já sai ativo.
              </p>
            </div>
            <Switch
              id="cfg-aprovacao"
              checked={f.aprovacaoManual}
              onCheckedChange={(v) => mudar({ aprovacaoManual: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comissão</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-comissao">Comissão padrão (%)</Label>
            <Input
              id="cfg-comissao"
              inputMode="decimal"
              value={f.comissao}
              onChange={(e) => mudar({ comissao: e.target.value })}
            />
            <Erro1 texto={erros.comissao} />
            <p className="text-xs text-muted-foreground">
              Vale para quem não tem percentual individual.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Input value="Recorrente" disabled />
            <p className="text-xs text-muted-foreground">
              Comissão a cada fatura paga pelo cliente indicado.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Duração</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="duracao"
                  checked={f.vitalicia}
                  onChange={() => mudar({ vitalicia: true })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Enquanto o cliente permanecer elegível (pagando)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="duracao"
                  checked={!f.vitalicia}
                  onChange={() => mudar({ vitalicia: false })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Por
                <Input
                  aria-label="Meses de comissão"
                  inputMode="numeric"
                  value={f.meses}
                  disabled={f.vitalicia}
                  onChange={(e) => mudar({ meses: e.target.value })}
                  className="h-8 w-20"
                />
                meses após o cadastro da loja
              </label>
            </div>
            <Erro1 texto={erros.meses} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Base da comissão</Label>
            <SeletorAdmin
              rotulo="Base da comissão"
              valor={f.base}
              aoMudar={(v) => mudar({ base: v as BaseDaComissao })}
              className="w-full"
              opcoes={(["cents_usage", "recurring", "invoice_total"] as const).map((b) => ({
                valor: b,
                rotulo: NOME_DA_BASE[b],
              }))}
            />
            <p className="text-xs text-muted-foreground">
              Sempre sobre receita efetivamente recebida (fatura paga e confirmada). Desconto da
              fatura é descontado na mesma proporção.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Repasses</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-repasse">Dias de repasse</Label>
            <Input
              id="cfg-repasse"
              inputMode="numeric"
              value={f.diasDeRepasse}
              onChange={(e) => mudar({ diasDeRepasse: e.target.value })}
            />
            <Erro1 texto={erros.repasse} />
            <p className="text-xs text-muted-foreground">
              Dias do mês (1 a 28, até 4) em que o sistema separa, sozinho, o saldo de cada
              parceiro. Ex.: 10, 20.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-saque">Repasse mínimo (R$)</Label>
            <Input
              id="cfg-saque"
              inputMode="decimal"
              value={f.saqueMinimo}
              onChange={(e) => mudar({ saqueMinimo: e.target.value })}
            />
            <Erro1 texto={erros.saque} />
            <p className="text-xs text-muted-foreground">
              Saldo menor fica guardado e soma no repasse seguinte.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-dias">Liberação da comissão (dias)</Label>
            <Input
              id="cfg-dias"
              inputMode="numeric"
              value={f.diasParaLiberar}
              onChange={(e) => mudar({ diasParaLiberar: e.target.value })}
            />
            <Erro1 texto={erros.dias} />
            <p className="text-xs text-muted-foreground">
              0 = entra no próximo repasse assim que o cliente paga. Estorno depois do repasse vira
              desconto no repasse seguinte.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Link de indicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Quanto tempo o clique no link continua valendo</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="janela"
                checked={f.linkSemPrazo}
                onChange={() => mudar({ linkSemPrazo: true })}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Sem prazo (o primeiro link clicado vale para sempre)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="janela"
                checked={!f.linkSemPrazo}
                onChange={() => mudar({ linkSemPrazo: false })}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Por
              <Input
                aria-label="Dias de validade do clique"
                inputMode="numeric"
                value={f.diasDoLink}
                disabled={f.linkSemPrazo}
                onChange={(e) => mudar({ diasDoLink: e.target.value })}
                className="h-8 w-20"
              />
              dias
            </label>
          </div>
          <Erro1 texto={erros.janela} />
          <p className="text-xs text-muted-foreground">
            O clique fica guardado no navegador da pessoa. Se ela limpar o navegador ou se cadastrar
            por outro aparelho, o clique se perde — nesses casos a equipe pode atribuir o cliente à
            mão em Indicações.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {atual.atualizado_por
            ? `Última alteração por ${atual.atualizado_por} em `
            : "Última alteração em "}
          {new Date(atual.atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
        <div className="flex gap-2">
          {form ? (
            <Button variant="outline" onClick={() => setForm(null)}>
              Descartar
            </Button>
          ) : null}
          <Button disabled={!valido || mudancas.length === 0} onClick={() => setConfirmar(true)}>
            Salvar configurações
          </Button>
        </div>
      </div>

      <ConfirmarAcao
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        titulo="Salvar configurações do programa"
        rotuloDoBotao="Salvar"
        descricao={
          <>
            <ul className="list-disc space-y-1 pl-5">
              {mudancas.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>Vale daqui para frente. Comissões já criadas não são recalculadas.</p>
          </>
        }
        aoConfirmar={async () => {
          try {
            await salvarConfiguracoes(novo);
            toast.success("Configurações salvas.");
            setForm(null);
            await qc.invalidateQueries({ queryKey: CHAVE_ADMIN });
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

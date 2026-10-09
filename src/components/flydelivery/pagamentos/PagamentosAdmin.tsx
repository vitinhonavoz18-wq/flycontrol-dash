/**
 * Painel Admin › Pagamentos FlyDelivery
 *
 * Só para administradores da plataforma. A tela esconde o menu de quem não é
 * admin, mas a TRAVA de verdade está no banco: as leituras passam pelas regras
 * de linha (RLS, `is_admin()`), e cada alteração é uma função do banco que
 * confere `is_admin()` antes de mexer e grava na auditoria.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ROTULO_DA_TARIFA,
  paraCsv,
  resumirPagamentos,
  resumirPorLoja,
  type QuemPagaATarifa,
} from "@/lib/flydelivery/pagamentos/resumo";
import { formatarCentavos, validarComissao } from "@/lib/flydelivery/pagamentos/split";
import {
  lerAuditoria,
  lerAvisosComProblema,
  lerConfiguracaoGeral,
  lerContas,
  lerPagamentos,
  mudarSituacaoDaConta,
  resolverConciliacao,
  salvarComissaoDaLoja,
  salvarComissaoPadrao,
  type AvisoRecebido,
  type ConfiguracaoGeral,
  type ContaRecebedora,
  type PagamentoNaTela,
  type RegistroDeAuditoria,
} from "@/lib/flydelivery/pagamentos/dados";
import {
  conciliarPixAgora,
  reconferirPagamentoAgora,
  situacaoDaIntegracaoPix,
} from "@/lib/flydelivery/pagamentos/painel.functions";
import { Indicador, SeloDaConta, SeloDoPagamento } from "./comum";
import { dataCurta, intervaloDosUltimosDias, PERIODOS } from "@/lib/flydelivery/pagamentos/periodo";

export function PagamentosAdmin() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 bg-white p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6 text-primary" />
          Pagamentos FlyDelivery
        </h1>
        <p className="text-sm text-muted-foreground">
          Pix pago no aplicativo com divisão automática (split) pela SyncPay: comissões, contas
          recebedoras, conciliação e auditoria.
        </p>
      </div>

      <SituacaoDaIntegracao />

      <Tabs defaultValue="visao">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="visao">Visão geral e conciliação</TabsTrigger>
          <TabsTrigger value="contas">Contas e comissões</TabsTrigger>
          <TabsTrigger value="transacoes">Transações</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="visao" className="mt-4">
          <VisaoGeral />
        </TabsContent>
        <TabsContent value="contas" className="mt-4">
          <ContasEComissoes />
        </TabsContent>
        <TabsContent value="transacoes" className="mt-4">
          <Transacoes />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-4">
          <Auditoria />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------- situação da integração --

function SituacaoDaIntegracao() {
  const [estado, setEstado] = useState<Awaited<ReturnType<typeof situacaoDaIntegracaoPix>> | null>(
    null,
  );
  const [conciliando, setConciliando] = useState(false);

  useEffect(() => {
    situacaoDaIntegracaoPix()
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  const conciliar = async () => {
    setConciliando(true);
    try {
      const r = await conciliarPixAgora();
      toast.success(
        `Conciliação: ${r.conferidos} conferido(s), ${r.vencidos} vencido(s), ${r.falhas} falha(s).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na conciliação.");
    } finally {
      setConciliando(false);
    }
  };

  if (!estado) return null;
  const pronto = estado.faltando.length === 0;
  return (
    <Card
      className={pronto ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/60"}
    >
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2 text-sm">
          {pronto ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          )}
          <div>
            <p className="font-medium">
              {pronto
                ? "Integração SyncPay configurada e ligada."
                : "Pix pelo aplicativo ainda DESLIGADO no servidor."}
            </p>
            {!pronto ? (
              <p className="text-muted-foreground">
                Falta configurar: {estado.faltando.join(", ")}.
              </p>
            ) : null}
            {estado.urlDoAviso ? (
              <p className="text-xs text-muted-foreground">
                Endereço do aviso para cadastrar na SyncPay: <code>{estado.urlDoAviso}</code>
              </p>
            ) : null}
            {!estado.conciliacaoAutomatica ? (
              <p className="text-xs text-muted-foreground">
                Conciliação automática desligada (FLYDELIVERY_RECONCILE_SECRET ausente).
              </p>
            ) : null}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={conciliar}
          disabled={conciliando || !pronto}
          className="gap-2"
        >
          {conciliando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reconferir pendentes agora
        </Button>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------- visão geral --

function usePagamentosDoPeriodo(dias: number) {
  const [linhas, setLinhas] = useState<PagamentoNaTela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { de, ate } = intervaloDosUltimosDias(dias);
      setLinhas(await lerPagamentos({ de, ate, limite: 5000 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar pagamentos.");
    } finally {
      setCarregando(false);
    }
  }, [dias]);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { linhas, carregando, recarregar };
}

function SeletorDePeriodo({ dias, aoMudar }: { dias: number; aoMudar: (d: number) => void }) {
  return (
    <Select value={String(dias)} onValueChange={(v) => aoMudar(Number(v))}>
      <SelectTrigger className="w-[180px] bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODOS.map((p) => (
          <SelectItem key={p.dias} value={String(p.dias)}>
            {p.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function baixarCsv(nome: string, conteudo: string) {
  // BOM para o Excel reconhecer os acentos.
  const blob = new Blob(["﻿", conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function VisaoGeral() {
  const [dias, setDias] = useState(30);
  const { linhas, carregando } = usePagamentosDoPeriodo(dias);
  const resumo = useMemo(() => resumirPagamentos(linhas), [linhas]);
  const porLoja = useMemo(() => resumirPorLoja(linhas), [linhas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeletorDePeriodo dias={dias} aoMudar={setDias} />
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={linhas.length === 0}
          onClick={() => baixarCsv(`pagamentos-flydelivery-${dias}d.csv`, paraCsv(linhas))}
        >
          <Download className="h-4 w-4" /> Exportar relatório (CSV)
        </Button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Pagos e conferidos"
              valor={formatarCentavos(resumo.confirmadas.centavos)}
              detalhe={`${resumo.confirmadas.quantidade} pedido(s)`}
              destaque
            />
            <Indicador
              titulo="Comissão da plataforma (bruta)"
              valor={formatarCentavos(resumo.comissaoPlataforma)}
            />
            <Indicador
              titulo="Devido às lojas (bruto)"
              valor={formatarCentavos(resumo.repasseBrutoLoja)}
            />
            <Indicador
              titulo="Tarifas SyncPay"
              valor={
                resumo.tarifasInformadas === null
                  ? "Não informadas"
                  : formatarCentavos(resumo.tarifasInformadas)
              }
              detalhe={`${resumo.vendasSemTarifa} venda(s) sem tarifa informada`}
            />
            <Indicador
              titulo="Pendentes"
              valor={formatarCentavos(resumo.pendentes.centavos)}
              detalhe={`${resumo.pendentes.quantidade} Pix aguardando`}
            />
            <Indicador
              titulo="Com erro"
              valor={String(resumo.comErro.quantidade)}
              detalhe="Falhou ou divergente"
            />
            <Indicador
              titulo="Estornos e ajustes"
              valor={formatarCentavos(resumo.estornosEAjustes.centavos)}
              detalhe={`${resumo.estornosEAjustes.quantidade} ocorrência(s)`}
            />
            <Indicador
              titulo="Pendências de conciliação"
              valor={String(resumo.pendenciasDeConciliacao)}
              detalhe="Ver aba Transações"
            />
          </div>

          <Card className="border-zinc-200 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conciliação por estabelecimento</CardTitle>
              <CardDescription>
                Valores previstos pela divisão combinada. O depositado de fato deve ser conferido no
                extrato da SyncPay.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estabelecimento</TableHead>
                    <TableHead className="text-right">Pagos</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Devido à loja</TableHead>
                    <TableHead className="text-right">Pendentes</TableHead>
                    <TableHead className="text-right">Conferir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porLoja.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhum pagamento no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    porLoja.map((l) => (
                      <TableRow key={l.storeId}>
                        <TableCell className="font-medium">{l.loja}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.resumo.confirmadas.quantidade}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarCentavos(l.resumo.confirmadas.centavos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarCentavos(l.resumo.comissaoPlataforma)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarCentavos(l.resumo.repasseBrutoLoja)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.resumo.pendentes.quantidade}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.resumo.pendenciasDeConciliacao > 0 ? (
                            <span className="font-semibold text-amber-600">
                              {l.resumo.pendenciasDeConciliacao}
                            </span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------- contas e comissões --

function ContasEComissoes() {
  const [geral, setGeral] = useState<ConfiguracaoGeral | null>(null);
  const [contas, setContas] = useState<ContaRecebedora[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [comissaoPadrao, setComissaoPadrao] = useState("3");
  const [quemPaga, setQuemPaga] = useState<QuemPagaATarifa>("nao_definido");
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([lerConfiguracaoGeral(), lerContas()]);
      setGeral(g);
      setComissaoPadrao(String(g.default_fee_percent));
      setQuemPaga(g.gateway_fee_bearer);
      setContas(c);
      const ids = c.map((x) => x.pizzeria_id);
      if (ids.length) {
        const { data } = await supabase.from("pizzerias").select("id, name").in("id", ids);
        setNomes(Object.fromEntries((data ?? []).map((p) => [p.id, p.name])));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvarPadrao = async () => {
    const v = validarComissao(comissaoPadrao);
    if (!v.ok) {
      toast.error(v.motivo);
      return;
    }
    if (
      !window.confirm(`Mudar a comissão padrão para ${v.valor}%? Vale só para as próximas vendas.`)
    )
      return;
    setSalvando(true);
    try {
      await salvarComissaoPadrao(v.valor, quemPaga);
      toast.success("Comissão padrão salva.");
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comissão padrão da plataforma</CardTitle>
          <CardDescription>
            Percentual inteiro (a SyncPay não aceita fração no Pix), de 1% a 50%, sobre o valor
            total cobrado. Mudar aqui vale só para as vendas seguintes: cada pagamento guarda a
            comissão do momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label htmlFor="comissao-padrao">Comissão (%)</Label>
            <Input
              id="comissao-padrao"
              inputMode="numeric"
              className="w-28"
              value={comissaoPadrao}
              onChange={(e) => setComissaoPadrao(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label>Tarifa da SyncPay é paga por</Label>
            <Select value={quemPaga} onValueChange={(v) => setQuemPaga(v as QuemPagaATarifa)}>
              <SelectTrigger className="w-[260px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_DA_TARIFA) as QuemPagaATarifa[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ROTULO_DA_TARIFA[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={salvarPadrao} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            “Quem paga a tarifa” serve só para os relatórios calcularem o líquido. Ele precisa
            refletir o contrato real com a SyncPay — o sistema não presume.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estabelecimentos e contas recebedoras</CardTitle>
          <CardDescription>
            Ative uma conta SÓ depois de confirmar com a SyncPay que o Client ID pertence àquele
            estabelecimento e está habilitado para receber split. O sistema não consegue verificar
            isso sozinho.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estabelecimento</TableHead>
                <TableHead>Client ID SyncPay</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pix no app</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum estabelecimento informou conta ainda.
                  </TableCell>
                </TableRow>
              ) : (
                contas.map((c) => (
                  <LinhaDaConta
                    key={c.pizzeria_id}
                    conta={c}
                    nome={nomes[c.pizzeria_id] ?? c.pizzeria_id.slice(0, 8)}
                    comissaoPadrao={geral?.default_fee_percent ?? 3}
                    aoMudar={recarregar}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaDaConta({
  conta,
  nome,
  comissaoPadrao,
  aoMudar,
}: {
  conta: ContaRecebedora;
  nome: string;
  comissaoPadrao: number;
  aoMudar: () => Promise<void>;
}) {
  const [comissao, setComissao] = useState(conta.fee_percent_override?.toString() ?? "");
  const [ocupado, setOcupado] = useState(false);

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await acao();
      toast.success(ok);
      await aoMudar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro.");
    } finally {
      setOcupado(false);
    }
  };

  const mudarSituacao = (situacao: string, pergunta: string) => {
    const nota = window.prompt(pergunta, "");
    if (nota === null) return;
    void executar(
      () => mudarSituacaoDaConta(conta.pizzeria_id, situacao, nota),
      "Situação atualizada.",
    );
  };

  const salvarComissao = () => {
    if (comissao.trim() === "") {
      void executar(
        () => salvarComissaoDaLoja(conta.pizzeria_id, null),
        "Loja volta a usar a comissão padrão.",
      );
      return;
    }
    const v = validarComissao(comissao);
    if (!v.ok) {
      toast.error(v.motivo);
      return;
    }
    void executar(
      () => salvarComissaoDaLoja(conta.pizzeria_id, v.valor),
      `Comissão da loja: ${v.valor}%.`,
    );
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{nome}</TableCell>
      <TableCell>
        <code className="text-xs">{conta.syncpay_user_id ?? "—"}</code>
        {conta.status_note ? (
          <p className="text-xs text-muted-foreground">{conta.status_note}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <SeloDaConta status={conta.status} />
      </TableCell>
      <TableCell className="text-sm">{conta.pix_online_enabled ? "Ligado" : "Desligado"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            className="h-8 w-16"
            inputMode="numeric"
            placeholder={String(comissaoPadrao)}
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            aria-label={`Comissão de ${nome}`}
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={salvarComissao}>
            Salvar
          </Button>
        </div>
      </TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        {conta.syncpay_user_id && conta.status !== "ativa" ? (
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() =>
              mudarSituacao(
                "ativa",
                `Ativar a conta de ${nome}? Confirme que a SyncPay validou o Client ID ${conta.syncpay_user_id}. Anote como foi conferido:`,
              )
            }
          >
            Ativar
          </Button>
        ) : null}
        {conta.syncpay_user_id && conta.status !== "recusada" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => mudarSituacao("recusada", "Motivo da recusa (a loja vai ler):")}
          >
            Recusar
          </Button>
        ) : null}
        {conta.status === "ativa" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => mudarSituacao("suspensa", "Motivo da suspensão (a loja vai ler):")}
          >
            Suspender
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

// --------------------------------------------------------------- transações --

function Transacoes() {
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState("conciliar");
  const { linhas, carregando, recarregar } = usePagamentosDoPeriodo(dias);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    if (filtro === "todas") return linhas;
    if (filtro === "conciliar") return linhas.filter((l) => l.needs_reconciliation);
    if (filtro === "erros")
      return linhas.filter((l) =>
        ["falhou", "incerto", "divergente", "duplicado"].includes(l.status),
      );
    if (filtro === "pendentes")
      return linhas.filter((l) => ["criando", "pendente"].includes(l.status));
    return linhas.filter((l) => l.status === filtro);
  }, [linhas, filtro]);

  const reconferirAgora = async (id: string) => {
    setOcupado(id);
    try {
      const r = await reconferirPagamentoAgora({ data: { paymentId: id } });
      toast.success(`Reconferido: ${r.resultado}`);
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reconferir.");
    } finally {
      setOcupado(null);
    }
  };

  const resolver = async (id: string) => {
    const nota = window.prompt(
      "O que foi feito para resolver? (ex.: devolvido ao cliente pelo painel da SyncPay em 10/10)",
      "",
    );
    if (nota === null) return;
    setOcupado(id);
    try {
      await resolverConciliacao(id, nota);
      toast.success("Pendência encerrada e registrada na auditoria.");
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeletorDePeriodo dias={dias} aoMudar={setDias} />
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[240px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="conciliar">Precisam de conciliação</SelectItem>
            <SelectItem value="erros">Com erro ou incertas</SelectItem>
            <SelectItem value="pendentes">Pendentes</SelectItem>
            <SelectItem value="pago">Pagas</SelectItem>
            <SelectItem value="estornado">Estornadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{visiveis.length} registro(s)</span>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Nada por aqui.
                  </TableCell>
                </TableRow>
              ) : (
                visiveis.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {dataCurta(l.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{l.store_name ?? "—"}</TableCell>
                    <TableCell>{l.order_number ? `#${l.order_number}` : "—"}</TableCell>
                    <TableCell>
                      <SeloDoPagamento status={l.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarCentavos(l.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.fee_percent}% · {formatarCentavos(l.platform_amount_cents)}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {l.reconciliation_note ?? ""}
                      {l.provider_reference ? (
                        <div className="font-mono">ref: {l.provider_reference}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap text-right">
                      {l.provider_reference ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado === l.id}
                          onClick={() => reconferirAgora(l.id)}
                        >
                          Reconferir
                        </Button>
                      ) : null}
                      {l.needs_reconciliation ? (
                        <Button
                          size="sm"
                          disabled={ocupado === l.id}
                          onClick={() => resolver(l.id)}
                        >
                          Resolver
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- auditoria --

const ROTULO_DA_ACAO: Record<string, string> = {
  conta_recebedora_alterada: "Conta recebedora alterada",
  situacao_da_conta_alterada: "Situação da conta alterada",
  comissao_padrao_alterada: "Comissão padrão alterada",
  comissao_da_loja_alterada: "Comissão da loja alterada",
  pix_online_ligado: "Pix no app ligado",
  pix_online_desligado: "Pix no app desligado",
  conciliacao_resolvida: "Pendência de conciliação encerrada",
};

function Auditoria() {
  const [registros, setRegistros] = useState<RegistroDeAuditoria[]>([]);
  const [avisos, setAvisos] = useState<AvisoRecebido[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([lerAuditoria(), lerAvisosComProblema()])
      .then(([r, a]) => {
        setRegistros(r);
        setAvisos(a);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alterações financeiras (últimas 200)</CardTitle>
          <CardDescription>
            Inclui o histórico de comissões. Registro somente leitura: ninguém edita nem apaga.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>O quê</TableHead>
                <TableHead>Antes</TableHead>
                <TableHead>Depois</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {dataCurta(r.created_at)}
                  </TableCell>
                  <TableCell className="text-xs">{r.actor_kind}</TableCell>
                  <TableCell className="text-sm">{ROTULO_DA_ACAO[r.action] ?? r.action}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {r.before ? JSON.stringify(r.before) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {r.after ? JSON.stringify(r.after) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                    {r.note ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Avisos da SyncPay que pedem atenção</CardTitle>
          <CardDescription>
            Erro ao processar, transação desconhecida ou processamento interrompido.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Transação</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avisos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum aviso com problema.
                  </TableCell>
                </TableRow>
              ) : (
                avisos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {dataCurta(a.received_at)}
                    </TableCell>
                    <TableCell className="text-xs">{a.event_type ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.provider_reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{a.outcome ?? "em processamento"}</TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {a.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

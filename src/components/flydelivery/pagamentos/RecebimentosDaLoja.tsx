/**
 * Configurações › Financeiro › Recebimentos
 *
 * A tela em que o ESTABELECIMENTO:
 *   - informa o Client ID da conta SyncPay dele (para onde vai a parte dele);
 *   - vê a situação da conta e a comissão contratada;
 *   - liga ou desliga o Pix pelo aplicativo;
 *   - acompanha as vendas pagas pelo app e o que está pendente.
 *
 * O que esta tela NÃO afirma: que um valor já caiu na conta ou está
 * disponível para saque. Isso só a SyncPay sabe, e a tela diz isso.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Banknote, ChevronRight, Info, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import {
  EXPLICACAO_DA_CONTA,
  ROTULO_DA_TARIFA,
  liquidoPrevistoDaLoja,
  resumirPagamentos,
  type SituacaoDaConta,
} from "@/lib/flydelivery/pagamentos/resumo";
import { formatarCentavos } from "@/lib/flydelivery/pagamentos/split";
import {
  ligarPixNoApp,
  lerConfiguracaoGeral,
  lerContaDaLoja,
  lerPagamentos,
  type ConfiguracaoGeral,
  type ContaRecebedora,
  type PagamentoNaTela,
} from "@/lib/flydelivery/pagamentos/dados";
import { salvarContaRecebedora } from "@/lib/flydelivery/pagamentos/painel.functions";
import { Indicador, SeloDaConta, SeloDoPagamento } from "./comum";
import { dataCurta, intervaloDosUltimosDias, PERIODOS } from "@/lib/flydelivery/pagamentos/periodo";

type Loja = { id: string; name: string };

export function RecebimentosDaLoja() {
  const { user, isSuperAdmin, loading: carregandoSessao } = useAuth();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [carregandoLojas, setCarregandoLojas] = useState(true);

  useEffect(() => {
    if (carregandoSessao || !user) return;
    let cancelado = false;
    (async () => {
      let consulta = supabase
        .from("pizzerias")
        .select("id, name")
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("name");
      if (!isSuperAdmin) consulta = consulta.eq("owner_id", user.id);
      const { data, error } = await consulta;
      if (cancelado) return;
      if (error) toast.error("Não foi possível carregar suas lojas.");
      const lista = (data ?? []) as Loja[];
      setLojas(lista);
      setLojaId((atual) => atual ?? lista[0]?.id ?? null);
      setCarregandoLojas(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [carregandoSessao, user, isSuperAdmin]);

  if (carregandoSessao || carregandoLojas) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 bg-white p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <nav
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"
            aria-label="Caminho"
          >
            <Link to="/settings" className="hover:text-primary">
              Configurações
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Financeiro</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">Recebimentos</span>
          </nav>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Banknote className="h-6 w-6 text-primary" />
            Recebimentos pelo FlyDelivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Pix pago pelo cliente no aplicativo, com a sua parte enviada direto para a sua conta
            SyncPay.
          </p>
        </div>
        {lojas.length > 1 ? (
          <PizzeriaSelector pizzerias={lojas} activeId={lojaId} onSelect={setLojaId} />
        ) : null}
      </div>

      {lojaId ? (
        <PainelDaLoja key={lojaId} lojaId={lojaId} />
      ) : (
        <p className="text-muted-foreground">Nenhuma loja encontrada.</p>
      )}
    </div>
  );
}

function PainelDaLoja({ lojaId }: { lojaId: string }) {
  const [conta, setConta] = useState<ContaRecebedora | null>(null);
  const [geral, setGeral] = useState<ConfiguracaoGeral | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregarConta = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([lerContaDaLoja(lojaId), lerConfiguracaoGeral()]);
      setConta(c);
      setGeral(g);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [lojaId]);

  useEffect(() => {
    void recarregarConta();
  }, [recarregarConta]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const comissao = conta?.fee_percent_override ?? geral?.default_fee_percent ?? 3;

  return (
    <div className="space-y-6">
      <ContaRecebedoraCard
        lojaId={lojaId}
        conta={conta}
        comissao={comissao}
        aoMudar={recarregarConta}
      />
      <VendasDoPeriodo
        lojaId={lojaId}
        quemPagaATarifa={geral?.gateway_fee_bearer ?? "nao_definido"}
      />
    </div>
  );
}

function ContaRecebedoraCard({
  lojaId,
  conta,
  comissao,
  aoMudar,
}: {
  lojaId: string;
  conta: ContaRecebedora | null;
  comissao: number;
  aoMudar: () => Promise<void>;
}) {
  const [clientId, setClientId] = useState(conta?.syncpay_user_id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [mudandoPix, setMudandoPix] = useState(false);
  const situacao = (conta?.status ?? "nao_configurada") as SituacaoDaConta;
  const mudou = clientId.trim() !== (conta?.syncpay_user_id ?? "");

  const salvar = async () => {
    if (conta?.syncpay_user_id && mudou) {
      const ok = window.confirm(
        "Trocar a conta recebedora desliga o Pix no aplicativo até a equipe FlyDelivery conferir a conta nova. Continuar?",
      );
      if (!ok) return;
    }
    setSalvando(true);
    try {
      await salvarContaRecebedora({ data: { storeId: lojaId, syncpayUserId: clientId.trim() } });
      toast.success("Conta salva. Agora a equipe FlyDelivery confere com a SyncPay.");
      await aoMudar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarPix = async (ligado: boolean) => {
    setMudandoPix(true);
    try {
      await ligarPixNoApp(lojaId, ligado);
      toast.success(ligado ? "Pix pelo aplicativo ligado." : "Pix pelo aplicativo desligado.");
      await aoMudar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setMudandoPix(false);
    }
  };

  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Conta recebedora SyncPay</CardTitle>
          <SeloDaConta status={situacao} />
        </div>
        <CardDescription>{EXPLICACAO_DA_CONTA[situacao]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {conta?.status_note ? (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Observação da equipe:</strong> {conta.status_note}
            </span>
          </div>
        ) : null}

        <div className="grid gap-2 md:max-w-xl">
          <Label htmlFor="syncpay-client-id">Client ID da sua conta SyncPay</Label>
          <div className="flex gap-2">
            <Input
              id="syncpay-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Copie do painel da SyncPay"
              autoComplete="off"
              spellCheck={false}
            />
            <Button onClick={salvar} disabled={salvando || !mudou}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Só o identificador da conta. <strong>Nunca</strong> informe aqui o “Client Secret” nem
            senha: para receber, a SyncPay só precisa saber para quem mandar.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-zinc-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Comissão contratada
            </p>
            <p className="text-2xl font-bold text-primary">{comissao}%</p>
            <p className="text-xs text-muted-foreground">
              Sobre o valor total cobrado no Pix (produtos + entrega − desconto). Ex.: pedido de R$
              100,00 → {formatarCentavos(10_000 - Math.floor((10_000 * (100 - comissao)) / 100))}{" "}
              para o FlyDelivery e {formatarCentavos(Math.floor((10_000 * (100 - comissao)) / 100))}{" "}
              para a sua conta, antes da tarifa da SyncPay.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border border-zinc-200 p-4">
            <div>
              <p className="font-medium">Oferecer Pix pelo aplicativo</p>
              <p className="text-xs text-muted-foreground">
                {situacao === "ativa"
                  ? "Quando ligado, o cliente pode pagar no app e o pedido só chega aqui depois de pago."
                  : "Disponível depois que a conta for conferida e ativada pela equipe FlyDelivery."}
              </p>
            </div>
            <Switch
              checked={!!conta?.pix_online_enabled}
              disabled={situacao !== "ativa" || mudandoPix}
              onCheckedChange={alternarPix}
              aria-label="Oferecer Pix pelo aplicativo"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VendasDoPeriodo({
  lojaId,
  quemPagaATarifa,
}: {
  lojaId: string;
  quemPagaATarifa: ConfiguracaoGeral["gateway_fee_bearer"];
}) {
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState("todas");
  const [linhas, setLinhas] = useState<PagamentoNaTela[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    const { de, ate } = intervaloDosUltimosDias(dias);
    lerPagamentos({ storeId: lojaId, de, ate })
      .then((l) => !cancelado && setLinhas(l))
      .catch(
        (e) =>
          !cancelado && toast.error(e instanceof Error ? e.message : "Erro ao carregar vendas."),
      )
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [lojaId, dias]);

  const resumo = useMemo(() => resumirPagamentos(linhas), [linhas]);
  const liquido = liquidoPrevistoDaLoja(resumo, quemPagaATarifa);
  const visiveis = useMemo(() => {
    if (filtro === "todas") return linhas;
    if (filtro === "pendentes")
      return linhas.filter((l) => ["criando", "pendente", "incerto"].includes(l.status));
    if (filtro === "ajustes")
      return linhas.filter((l) =>
        ["estornado", "em_disputa", "duplicado", "divergente"].includes(l.status),
      );
    return linhas.filter((l) => l.status === filtro);
  }, [linhas, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Vendas pagas pelo aplicativo</h2>
        <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
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
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Vendas confirmadas"
              valor={formatarCentavos(resumo.confirmadas.centavos)}
              detalhe={`${resumo.confirmadas.quantidade} pedido(s) pagos e conferidos`}
              destaque
            />
            <Indicador
              titulo="Pendentes"
              valor={formatarCentavos(resumo.pendentes.centavos)}
              detalhe={`${resumo.pendentes.quantidade} Pix gerado(s) ainda sem pagamento`}
            />
            <Indicador
              titulo="Comissão FlyDelivery"
              valor={formatarCentavos(resumo.comissaoPlataforma)}
              detalhe="Bruta, das vendas confirmadas"
            />
            <Indicador
              titulo="Sua parte (bruta, prevista)"
              valor={formatarCentavos(resumo.repasseBrutoLoja)}
              detalhe="Valor devido pela divisão, antes da tarifa"
            />
            <Indicador
              titulo="Tarifas SyncPay"
              valor={
                resumo.tarifasInformadas === null
                  ? "Não informadas"
                  : formatarCentavos(resumo.tarifasInformadas)
              }
              detalhe={ROTULO_DA_TARIFA[quemPagaATarifa]}
            />
            <Indicador
              titulo="Seu líquido (previsto)"
              valor={liquido === null ? "Depende da tarifa" : formatarCentavos(liquido)}
              detalhe="Confirme o valor depositado na sua conta SyncPay"
            />
            <Indicador
              titulo="Estornos e ajustes"
              valor={formatarCentavos(resumo.estornosEAjustes.centavos)}
              detalhe={`${resumo.estornosEAjustes.quantidade} ocorrência(s)`}
            />
            <Indicador
              titulo="Pendências financeiras"
              valor={String(resumo.pendenciasDeConciliacao)}
              detalhe="Em conferência pela equipe FlyDelivery"
            />
          </div>

          <div className="flex gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              “Devido” é o que a divisão combinada manda para a sua conta em cada venda. O que já
              foi
              <strong> depositado</strong> e o <strong>saldo disponível para saque</strong> só
              aparecem no painel da própria SyncPay — o FlyDelivery não afirma esses valores.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-[220px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as situações</SelectItem>
                <SelectItem value="pago">Pagas</SelectItem>
                <SelectItem value="pendentes">Pendentes</SelectItem>
                <SelectItem value="ajustes">Estornos, disputas e divergências</SelectItem>
                <SelectItem value="expirado">Expiradas</SelectItem>
                <SelectItem value="falhou">Não concluídas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{visiveis.length} registro(s)</span>
          </div>

          {visiveis.length === 0 ? (
            <Card className="border-dashed bg-white">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhum pagamento pelo aplicativo neste período.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor cobrado</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Sua parte (bruta)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {dataCurta(l.created_at)}
                      </TableCell>
                      <TableCell>{l.order_number ? `#${l.order_number}` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SeloDoPagamento status={l.status} />
                          {l.needs_reconciliation ? (
                            <AlertTriangle
                              className="h-4 w-4 text-amber-500"
                              aria-label="Em conferência"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarCentavos(l.amount_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {l.fee_percent}% · {formatarCentavos(l.platform_amount_cents)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatarCentavos(l.store_amount_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

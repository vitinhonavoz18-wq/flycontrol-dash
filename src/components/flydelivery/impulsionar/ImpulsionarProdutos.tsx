/**
 * FlyDelivery → "Impulsionar no FlyDelivery" (modelo pós-pago).
 *
 *   Topo       — "Publicidade deste ciclo": quanto já vai entrar na próxima
 *                fatura, e quando ela fecha;
 *   Números    — o mês: investimento, produtos, dias, impressões, cliques e
 *                pedidos que vieram dos anúncios;
 *   Produtos   — o cardápio com o botão "Impulsionar" (ou o motivo de não
 *                poder);
 *   Em andamento — ativos, agendados e pausados, com dias restantes;
 *   Histórico  — tudo, com a situação do anúncio e a situação da cobrança.
 *
 * O anúncio é só uma LIGAÇÃO com o produto do cardápio: foto e preço vêm do
 * cadastro. O VALOR contratado, esse sim, fica congelado no contrato.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  Eye,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Package,
  Pause,
  Play,
  ReceiptText,
  Rocket,
  Search,
  ShoppingBag,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  COR_DO_STATUS,
  LIMITE_DE_CAMPANHAS,
  contaNoLimite,
  corFinanceira,
  dataCurta,
  dataLonga,
  diasRestantesTexto,
  motivoParaNaoContratar,
  motivoParaNaoImpulsionar,
  quandoEntraNaFatura,
  reaisDeCentavos,
  rotuloDoStatus,
  rotuloFinanceiro,
  taxaDeCliques,
  type ResumoDoImpulsionamento,
  type StatusDeCampanha,
} from "@/lib/flydelivery/campanhas";
import { CampanhaDialog, type ProdutoImpulsionavel } from "./CampanhaDialog";

type Produto = ProdutoImpulsionavel & {
  active: boolean | null;
  available: boolean | null;
  product_type: string | null;
};

type Impulso = {
  campaign_id: string;
  product_id: string;
  product_name: string;
  image_url: string | null;
  package_label: string | null;
  duration_days: number | null;
  amount_cents: number;
  status: string;
  display_status: string;
  start_at: string;
  end_at: string;
  contracted_at: string;
  days_remaining: number;
  charge_status: string | null;
  invoice_number: string | null;
  impressions: number;
  clicks: number;
  review_note: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ImpulsionarProdutos({
  pizzeriaId,
  storeName,
  lojaNoFlyDelivery,
}: {
  pizzeriaId: string;
  storeName: string;
  lojaNoFlyDelivery: boolean;
}) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [impulsos, setImpulsos] = useState<Impulso[]>([]);
  const [resumo, setResumo] = useState<ResumoDoImpulsionamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [aberturas, setAberturas] = useState(0);
  const [aba, setAba] = useState("produtos");
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [prods, lista, visao] = await Promise.all([
      supabase
        .from("menu_products")
        .select(
          "id, name, image_url, price, flydelivery_promo_price, active, available, product_type, menu_categories(name)",
        )
        .eq("pizzeria_id", pizzeriaId)
        .eq("active", true)
        .order("name"),
      supabase.rpc("flydelivery_boost_list", { p_pizzeria_id: pizzeriaId }),
      supabase.rpc("flydelivery_boost_overview", { p_pizzeria_id: pizzeriaId }),
    ]);
    if (prods.error) toast.error("Erro ao carregar produtos: " + prods.error.message);
    if (lista.error) toast.error("Erro ao carregar impulsionamentos: " + lista.error.message);
    if (visao.error) toast.error("Erro ao carregar o resumo: " + visao.error.message);
    setProdutos(
      (
        (prods.data ?? []) as unknown as Array<
          Produto & { menu_categories: { name: string } | null }
        >
      ).map((p) => ({ ...p, category_name: p.menu_categories?.name ?? null })),
    );
    setImpulsos((lista.data ?? []) as unknown as Impulso[]);
    setResumo((visao.data ?? null) as unknown as ResumoDoImpulsionamento | null);
    setCarregando(false);
  }, [pizzeriaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const vivos = useMemo(() => impulsos.filter((c) => contaNoLimite(c.display_status)), [impulsos]);
  const cheia = vivos.length >= LIMITE_DE_CAMPANHAS;
  const produtoComImpulso = useMemo(
    () => new Map(vivos.map((c) => [c.product_id, c.display_status])),
    [vivos],
  );
  const bloqueio = motivoParaNaoContratar(resumo);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [produtos, busca]);

  const mudarStatus = async (c: Impulso, status: "paused" | "active" | "cancelled") => {
    setMexendo(c.campaign_id);
    const { error } = await supabase
      .from("flydelivery_campaigns")
      .update(
        status === "cancelled" ? { status, cancel_reason: "Cancelado pela loja" } : { status },
      )
      .eq("id", c.campaign_id);
    setMexendo(null);
    if (error) toast.error("Não foi possível alterar: " + error.message);
    else
      toast.success(
        status === "paused"
          ? "Impulsionamento pausado."
          : status === "active"
            ? "Impulsionamento retomado."
            : "Impulsionamento cancelado.",
      );
    carregar();
  };

  const cancelar = (c: Impulso) => {
    const naoComecou = new Date(c.start_at) > new Date();
    const valor = reaisDeCentavos(c.amount_cents);
    let aviso = `Cancelar o impulsionamento de “${c.product_name}”?`;
    if (c.charge_status === "pending_invoice") {
      aviso +=
        naoComecou && resumo?.refund_if_not_started !== false
          ? `\n\nEle ainda não começou, então os ${valor} NÃO serão cobrados.`
          : `\n\nO anúncio sai do ar agora, mas os ${valor} continuam na sua próxima fatura, porque ele já começou a rodar.`;
    }
    if (window.confirm(aviso)) mudarStatus(c, "cancelled");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" /> Impulsione seus produtos
              </CardTitle>
              <CardDescription>
                Seus produtos em destaque, com o selo “Patrocinado”, para clientes do FlyDelivery.
                Ao tocar, o cliente cai direto no produto.
              </CardDescription>
            </div>
            <Badge variant={cheia ? "default" : "secondary"} className="shrink-0 text-sm">
              {vivos.length}/{LIMITE_DE_CAMPANHAS} ao mesmo tempo
            </Badge>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-primary">
            <Zap className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">
              <strong>Anuncie agora. Pague junto com sua próxima fatura.</strong>{" "}
              <span className="opacity-90">Sem pagamento agora.</span>
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* Publicidade deste ciclo */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Publicidade deste ciclo</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {carregando ? "…" : reaisDeCentavos(resumo?.pending_amount_cents ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                Esse valor será adicionado à sua próxima fatura.
              </p>
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2 text-sm sm:text-right">
            <p className="text-muted-foreground">Próxima cobrança</p>
            <p className="font-semibold">
              {resumo?.next_invoice_at
                ? dataLonga(resumo.next_invoice_at)
                : resumo?.cycle_type === "free_trial"
                  ? "Depois do período grátis"
                  : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Números do mês */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero
          icone={Wallet}
          rotulo="Investimento no mês"
          valor={reaisDeCentavos(resumo?.month_invested_cents ?? 0)}
        />
        <Numero
          icone={Package}
          rotulo="Produtos impulsionados"
          valor={String(resumo?.month_products ?? 0)}
        />
        <Numero
          icone={Rocket}
          rotulo="Ativos agora"
          valor={String(resumo?.active_now ?? 0)}
          extra={resumo?.scheduled ? `+${resumo.scheduled} agendado(s)` : undefined}
        />
        <Numero
          icone={CalendarDays}
          rotulo="Dias contratados"
          valor={String(resumo?.month_days_contracted ?? 0)}
        />
        <Numero icone={Eye} rotulo="Impressões" valor={String(resumo?.month_impressions ?? 0)} />
        <Numero
          icone={MousePointerClick}
          rotulo="Cliques"
          valor={String(resumo?.month_clicks ?? 0)}
          extra={`Taxa ${taxaDeCliques(resumo?.month_impressions ?? 0, resumo?.month_clicks ?? 0)}`}
        />
        <Numero
          icone={ShoppingBag}
          rotulo="Pedidos vindos dos anúncios"
          valor={String(resumo?.month_orders ?? 0)}
          extra={
            resumo?.month_orders_revenue_cents
              ? `${reaisDeCentavos(resumo.month_orders_revenue_cents)} em produtos`
              : undefined
          }
        />
        <Numero
          icone={ReceiptText}
          rotulo="Na próxima fatura"
          valor={reaisDeCentavos(resumo?.pending_amount_cents ?? 0)}
        />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Números do mês atual. Impressão = o anúncio apareceu de verdade na tela de um cliente (uma
        vez por visita). Pedidos contam quando o cliente comprou o produto a partir do anúncio, no
        aplicativo atualizado.
      </p>

      {bloqueio ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {bloqueio}
        </p>
      ) : null}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="andamento">
            Em andamento{vivos.length ? ` (${vivos.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-3 pt-3">
          {cheia ? (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              Sua loja já tem {LIMITE_DE_CAMPANHAS} impulsionamentos ao mesmo tempo. Espere um
              terminar (ou cancele um) para impulsionar outro produto.
            </p>
          ) : null}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto"
              className="pl-9"
            />
          </div>
          {carregando ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtrados.map((p) => {
                const motivo = motivoParaNaoImpulsionar(p, lojaNoFlyDelivery);
                const emImpulso = produtoComImpulso.get(p.id);
                const promo =
                  p.flydelivery_promo_price != null && p.flydelivery_promo_price < p.price
                    ? p.flydelivery_promo_price
                    : null;
                return (
                  <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {p.image_url && /^https?:\/\//i.test(p.image_url) ? (
                        <img
                          src={p.image_url}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="line-clamp-1 font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.category_name ?? "Sem categoria"}
                        </p>
                        <p className="text-sm">
                          <span className={promo ? "text-muted-foreground line-through" : ""}>
                            {brl(p.price)}
                          </span>
                          {promo ? (
                            <span className="ml-2 font-semibold text-primary">{brl(promo)}</span>
                          ) : null}
                        </p>
                        {emImpulso ? (
                          <Badge
                            variant="secondary"
                            className={COR_DO_STATUS[emImpulso as StatusDeCampanha]}
                          >
                            {rotuloDoStatus(emImpulso)}
                          </Badge>
                        ) : motivo ? (
                          <p className="text-xs text-destructive">{motivo}</p>
                        ) : (
                          <Badge variant="secondary" className="bg-success/15 text-success">
                            Pode impulsionar
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      disabled={!!motivo || !!emImpulso || cheia || !!bloqueio}
                      onClick={() => {
                        setAberturas((n) => n + 1);
                        setEscolhido(p);
                      }}
                    >
                      <Rocket className="mr-1 h-4 w-4" /> Impulsionar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="andamento" className="space-y-3 pt-3">
          {vivos.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum impulsionamento em andamento. Escolha um produto na aba Produtos e toque em
              “Impulsionar”.
            </p>
          ) : (
            vivos.map((c) => (
              <div key={c.campaign_id} className="rounded-lg border p-3">
                <div className="flex gap-3">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="line-clamp-1 font-semibold">{c.product_name}</p>
                      <Badge
                        variant="secondary"
                        className={COR_DO_STATUS[c.display_status as StatusDeCampanha]}
                      >
                        {rotuloDoStatus(c.display_status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.package_label ?? `${c.duration_days ?? "?"} dias`} ·{" "}
                      <span className="font-medium text-foreground">
                        {reaisDeCentavos(c.amount_cents)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.display_status === "scheduled"
                        ? `Começa em ${dataCurta(c.start_at)} · termina em ${dataCurta(c.end_at)}`
                        : `Termina em ${dataCurta(c.end_at)} · faltam ${diasRestantesTexto(c.days_remaining)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className={corFinanceira(c.charge_status)}>
                      {rotuloFinanceiro(c.charge_status, c.invoice_number)}
                    </Badge>
                    <span>
                      {c.impressions} impressões · {c.clicks} cliques ·{" "}
                      {taxaDeCliques(c.impressions, c.clicks)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {c.display_status === "active" || c.display_status === "scheduled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mexendo === c.campaign_id}
                        onClick={() => mudarStatus(c, "paused")}
                        title="Pausar não estende o período nem muda o valor"
                      >
                        <Pause className="mr-1 h-4 w-4" /> Pausar
                      </Button>
                    ) : null}
                    {c.display_status === "paused" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mexendo === c.campaign_id}
                        onClick={() => mudarStatus(c, "active")}
                      >
                        <Play className="mr-1 h-4 w-4" /> Retomar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={mexendo === c.campaign_id}
                      onClick={() => cancelar(c)}
                    >
                      <X className="mr-1 h-4 w-4" /> Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
          {vivos.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Cancelar antes de começar: não é cobrado. Depois que começou, o anúncio sai do ar mas
              o valor continua na fatura. Pausar não estende o período.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="historico" className="pt-3">
          {impulsos.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum impulsionamento ainda.
            </p>
          ) : (
            <>
              {/* Celular: cartões */}
              <ul className="divide-y rounded-lg border md:hidden">
                {impulsos.map((c) => (
                  <li key={c.campaign_id} className="space-y-1 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 font-medium">{c.product_name}</p>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {reaisDeCentavos(c.amount_cents)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.package_label ?? "—"} · {dataCurta(c.start_at)} → {dataCurta(c.end_at)} ·
                      contratado em {dataLonga(c.contracted_at)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="secondary"
                        className={COR_DO_STATUS[c.display_status as StatusDeCampanha]}
                      >
                        {rotuloDoStatus(c.display_status)}
                      </Badge>
                      <Badge variant="secondary" className={corFinanceira(c.charge_status)}>
                        {rotuloFinanceiro(c.charge_status, c.invoice_number)}
                      </Badge>
                    </div>
                    {c.review_note ? (
                      <p className="text-xs text-muted-foreground">Observação: {c.review_note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {/* Computador: tabela */}
              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">Produto</th>
                      <th className="p-3">Período</th>
                      <th className="p-3 text-right">Valor</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Status do anúncio</th>
                      <th className="p-3">Status financeiro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {impulsos.map((c) => (
                      <tr key={c.campaign_id}>
                        <td className="p-3">
                          <p className="line-clamp-1 font-medium">{c.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.impressions} impressões · {c.clicks} cliques
                          </p>
                        </td>
                        <td className="whitespace-nowrap p-3">
                          <p>{c.package_label ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {dataCurta(c.start_at)} → {dataCurta(c.end_at)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">
                          {reaisDeCentavos(c.amount_cents)}
                        </td>
                        <td className="whitespace-nowrap p-3">{dataLonga(c.contracted_at)}</td>
                        <td className="p-3">
                          <Badge
                            variant="secondary"
                            className={COR_DO_STATUS[c.display_status as StatusDeCampanha]}
                          >
                            {rotuloDoStatus(c.display_status)}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className={corFinanceira(c.charge_status)}>
                            {rotuloFinanceiro(c.charge_status, c.invoice_number)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            O valor de cada impulsionamento entra {quandoEntraNaFatura(resumo)}, como uma linha
            separada do plano.
          </p>
        </TabsContent>
      </Tabs>

      {escolhido ? (
        <CampanhaDialog
          key={aberturas}
          produto={escolhido}
          storeName={storeName}
          resumo={resumo}
          onClose={() => setEscolhido(null)}
          onContratado={() => {
            setEscolhido(null);
            setAba("andamento");
            carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Numero({
  icone: Icone,
  rotulo,
  valor,
  extra,
}: {
  icone: typeof Rocket;
  rotulo: string;
  valor: string;
  extra?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="flex items-start gap-1.5 text-xs leading-tight text-muted-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0" />
        <span className="line-clamp-2">{rotulo}</span>
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">{valor}</p>
      {extra ? <p className="text-[11px] text-muted-foreground">{extra}</p> : null}
    </div>
  );
}

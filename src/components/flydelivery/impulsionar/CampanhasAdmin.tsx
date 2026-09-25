/**
 * Administração — impulsionamentos de todas as lojas.
 *
 * No modelo pós-pago o anúncio entra no ar quando a loja confirma (ela já
 * aceitou a cobrança na próxima fatura). Daqui a administração acompanha
 * tudo — loja, produto, pacote, valor, situação do anúncio e da cobrança, e
 * em qual fatura entrou — e pode:
 *   - pausar, retomar e mudar a prioridade (maior aparece antes);
 *   - dispensar uma cobrança que ainda não foi para a fatura ("Não cobrar");
 *   - aprovar ou recusar campanhas antigas, criadas antes do pós-pago.
 *
 * Os pacotes e preços ficam logo abaixo, em `PacotesAdmin`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Ban, Check, Loader2, Pause, Play, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  COR_DO_STATUS,
  corFinanceira,
  dataCurta,
  dataLonga,
  reaisDeCentavos,
  rotuloDoStatus,
  rotuloFinanceiro,
  taxaDeCliques,
  type StatusDeCampanha,
} from "@/lib/flydelivery/campanhas";
import { PacotesAdmin } from "./PacotesAdmin";

type Linha = {
  campaign_id: string;
  pizzeria_id: string;
  store_name: string;
  product_name: string;
  image_url: string | null;
  package_label: string | null;
  duration_days: number | null;
  amount_cents: number;
  status: string;
  display_status: string;
  priority: number;
  start_at: string;
  end_at: string;
  contracted_at: string;
  charge_id: string | null;
  charge_status: string | null;
  invoice_number: string | null;
  impressions: number;
  clicks: number;
  review_note: string | null;
  issues: string[];
};

export function CampanhasAdmin() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("flydelivery_boost_admin_list");
    if (error) toast.error("Erro ao carregar impulsionamentos: " + error.message);
    setLinhas((data ?? []) as unknown as Linha[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizar = async (
    l: Linha,
    patch: { status?: string; priority?: number; review_note?: string | null },
    ok: string,
  ) => {
    setMexendo(l.campaign_id);
    const { error } = await supabase
      .from("flydelivery_campaigns")
      .update(patch)
      .eq("id", l.campaign_id);
    setMexendo(null);
    if (error) toast.error("Não foi possível alterar: " + error.message);
    else toast.success(ok);
    carregar();
  };

  const naoCobrar = async (l: Linha) => {
    if (!l.charge_id) return;
    if (
      !window.confirm(
        `Não cobrar ${reaisDeCentavos(l.amount_cents)} de “${l.store_name}” por “${l.product_name}”?\n\nO valor sai da próxima fatura. O anúncio continua como está.`,
      )
    ) {
      return;
    }
    setMexendo(l.campaign_id);
    const { data, error } = await supabase
      .from("billing_addon_charges")
      .update({ status: "cancelled" })
      .eq("id", l.charge_id)
      .eq("status", "pending_invoice")
      .select("id");
    setMexendo(null);
    if (error) toast.error("Não foi possível dispensar: " + error.message);
    else if (!data?.length) toast.error("Essa cobrança já entrou numa fatura.");
    else toast.success("Cobrança dispensada.");
    carregar();
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) =>
        !q || l.store_name.toLowerCase().includes(q) || l.product_name.toLowerCase().includes(q),
    );
  }, [linhas, busca]);

  const totais = useMemo(() => {
    const soma = (s: string) =>
      linhas.filter((l) => l.charge_status === s).reduce((t, l) => t + l.amount_cents, 0);
    return { pendente: soma("pending_invoice"), faturado: soma("invoiced"), pago: soma("paid") };
  }, [linhas]);
  const pendentes = linhas.filter((l) => l.display_status === "pending").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Administração — impulsionamentos de todas as lojas
            {pendentes ? <Badge className="ml-1">{pendentes} antigas aguardando</Badge> : null}
          </CardTitle>
          <CardDescription>
            Só administradores veem este quadro. Prioridade maior aparece antes no aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Total rotulo="A faturar" valor={totais.pendente} />
            <Total rotulo="Faturado" valor={totais.faturado} />
            <Total rotulo="Pago" valor={totais.pago} />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar loja ou produto"
              className="pl-9"
            />
          </div>
          {carregando ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum impulsionamento.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtradas.map((l) => (
                <li
                  key={l.campaign_id}
                  className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    {l.image_url ? (
                      <img
                        src={l.image_url}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 space-y-0.5">
                      <p className="line-clamp-1 font-medium">
                        {l.product_name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          · {l.store_name}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Contratado em {dataLonga(l.contracted_at)} ·{" "}
                        {l.package_label ?? `${l.duration_days ?? "?"} dias`} ·{" "}
                        <span className="font-medium text-foreground">
                          {reaisDeCentavos(l.amount_cents)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dataCurta(l.start_at)} → {dataCurta(l.end_at)} · {l.impressions} impressões
                        · {l.clicks} cliques · {taxaDeCliques(l.impressions, l.clicks)}
                      </p>
                      {l.issues.length > 0 ? (
                        <p className="text-xs text-destructive">
                          Produto com pendência ({l.issues.join(", ")}) — não aparece no app.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={COR_DO_STATUS[l.display_status as StatusDeCampanha]}
                    >
                      {rotuloDoStatus(l.display_status)}
                    </Badge>
                    <Badge variant="secondary" className={corFinanceira(l.charge_status)}>
                      {rotuloFinanceiro(l.charge_status, l.invoice_number)}
                    </Badge>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      Prioridade
                      <Input
                        type="number"
                        defaultValue={l.priority}
                        className="h-8 w-16"
                        onBlur={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (Number.isFinite(v) && v !== l.priority) {
                            atualizar(l, { priority: v }, "Prioridade alterada.");
                          }
                        }}
                      />
                    </label>
                    {l.display_status === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={mexendo === l.campaign_id}
                          onClick={() =>
                            atualizar(
                              l,
                              { status: "active", review_note: null },
                              "Campanha aprovada.",
                            )
                          }
                        >
                          <Check className="mr-1 h-4 w-4" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mexendo === l.campaign_id}
                          onClick={() => {
                            const motivo = window.prompt("Motivo da recusa (a loja vai ver):", "");
                            if (motivo === null) return;
                            atualizar(
                              l,
                              {
                                status: "cancelled",
                                review_note: motivo.trim() || "Recusada pela administração.",
                              },
                              "Campanha recusada.",
                            );
                          }}
                        >
                          <X className="mr-1 h-4 w-4" /> Recusar
                        </Button>
                      </>
                    ) : null}
                    {l.display_status === "active" || l.display_status === "scheduled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mexendo === l.campaign_id}
                        onClick={() => atualizar(l, { status: "paused" }, "Pausado.")}
                      >
                        <Pause className="mr-1 h-4 w-4" /> Pausar
                      </Button>
                    ) : null}
                    {l.display_status === "paused" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mexendo === l.campaign_id}
                        onClick={() => atualizar(l, { status: "active" }, "Retomado.")}
                      >
                        <Play className="mr-1 h-4 w-4" /> Retomar
                      </Button>
                    ) : null}
                    {l.charge_status === "pending_invoice" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mexendo === l.campaign_id}
                        onClick={() => naoCobrar(l)}
                        title="Tira o valor da próxima fatura"
                      >
                        <Ban className="mr-1 h-4 w-4" /> Não cobrar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PacotesAdmin />
    </div>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-bold tabular-nums">{reaisDeCentavos(valor)}</p>
    </div>
  );
}

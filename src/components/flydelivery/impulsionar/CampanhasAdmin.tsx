/**
 * Administração — campanhas "Impulsionar" de todas as lojas.
 *
 * A campanha só vai ao ar depois que alguém daqui APROVA (decisão do dono do
 * sistema). Aqui também se recusa (com motivo, que a loja vê), pausa, retoma
 * e muda a prioridade — quem tem prioridade maior aparece antes na rotação.
 *
 * Preparado para crescer sem trocar a estrutura: preço por período fica na
 * tabela de planos; posições (`placements`) e banners institucionais
 * (`campaign_type = 'institutional'`) já existem no banco.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Pause, Play, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  COR_DO_STATUS,
  dataCurta,
  rotuloDoStatus,
  taxaDeCliques,
  type StatusDeCampanha,
} from "@/lib/flydelivery/campanhas";

type Linha = {
  campaign_id: string;
  store_name: string;
  product_name: string;
  image_url: string | null;
  status: string;
  display_status: string;
  priority: number;
  start_at: string;
  end_at: string;
  impressions: number;
  clicks: number;
  review_note: string | null;
  issues: string[];
};

export function CampanhasAdmin() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc("flydelivery_campaign_admin_list");
    if (error) toast.error("Erro ao carregar campanhas: " + error.message);
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

  const pendentes = linhas.filter((l) => l.display_status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Administração — campanhas de todas as lojas
          {pendentes ? <Badge className="ml-1">{pendentes} aguardando</Badge> : null}
        </CardTitle>
        <CardDescription>
          Só administradores veem este quadro. A campanha só aparece no aplicativo depois de
          aprovada aqui. Prioridade maior aparece antes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {linhas.map((l) => (
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
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-medium">
                      {l.product_name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {l.store_name}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dataCurta(l.start_at)} → {dataCurta(l.end_at)} · {l.impressions} impressões ·{" "}
                      {l.clicks} cliques · CTR {taxaDeCliques(l.impressions, l.clicks)}
                    </p>
                    {l.issues.length > 0 ? (
                      <p className="text-xs text-destructive">
                        Produto com pendência ({l.issues.join(", ")}) — não aparece mesmo aprovado.
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
                      onClick={() => atualizar(l, { status: "paused" }, "Campanha pausada.")}
                    >
                      <Pause className="mr-1 h-4 w-4" /> Pausar
                    </Button>
                  ) : null}
                  {l.display_status === "paused" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mexendo === l.campaign_id}
                      onClick={() => atualizar(l, { status: "active" }, "Campanha retomada.")}
                    >
                      <Play className="mr-1 h-4 w-4" /> Retomar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

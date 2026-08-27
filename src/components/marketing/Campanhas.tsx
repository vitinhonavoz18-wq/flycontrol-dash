import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pause, Play, X, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { listarCampanhas, mudarEstadoCampanha } from "@/lib/marketing/marketing.functions";
import { AssistenteCampanha } from "./AssistenteCampanha";

/**
 * Campanhas: a lista e o histórico, no mesmo lugar.
 *
 * Separar "campanhas" de "histórico" em duas abas obrigaria o dono a lembrar
 * em qual delas está a campanha que ele quer ver — e "está rodando" ou "já
 * terminou" muda sozinho enquanto ele olha. Uma lista só, do mais novo para o
 * mais velho, com o estado escrito em cada linha, resolve os dois casos.
 */

const ESTADOS: Record<string, { rotulo: string; cor: string; explicacao: string }> = {
  draft: {
    rotulo: "Rascunho",
    cor: "bg-muted text-muted-foreground",
    explicacao: "Ainda não foi disparada.",
  },
  scheduled: {
    rotulo: "Agendada",
    cor: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    explicacao: "Vai sair na hora marcada.",
  },
  queued: {
    rotulo: "Na fila",
    cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    explicacao: "As mensagens estão prontas, esperando a vez de sair.",
  },
  processing: {
    rotulo: "Enviando",
    cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    explicacao: "Saindo agora.",
  },
  completed: {
    rotulo: "Concluída",
    cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    explicacao: "Todas as mensagens já tiveram um desfecho.",
  },
  paused: {
    rotulo: "Pausada",
    cor: "bg-muted text-muted-foreground",
    explicacao: "Parada. O que já saiu, saiu.",
  },
  cancelled: {
    rotulo: "Cancelada",
    cor: "bg-muted text-muted-foreground",
    explicacao: "O que não tinha saído foi barrado.",
  },
  failed: {
    rotulo: "Com problema",
    cor: "bg-destructive/15 text-destructive",
    explicacao: "Algo impediu o envio.",
  },
};

type Campanha = {
  id: string;
  name: string;
  status: string;
  type: string;
  estimated_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  coupon_code: string | null;
  created_at: string;
};

export function Campanhas({ tenantId }: { tenantId: string }) {
  const buscar = useServerFn(listarCampanhas);
  const mudar = useServerFn(mudarEstadoCampanha);

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nomeRestaurante, setNomeRestaurante] = useState("");
  const [agindo, setAgindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await buscar({ data: { tenantId } });
      setCampanhas(r.campanhas as Campanha[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui carregar as campanhas");
    } finally {
      setCarregando(false);
    }
  }, [buscar, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("pizzerias")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) setNomeRestaurante(data?.name ?? "");
      });
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  async function acao(id: string, acao: "pausar" | "retomar" | "cancelar") {
    if (acao === "cancelar") {
      const ok = window.confirm(
        "Cancelar esta campanha? As mensagens que ainda não saíram não serão enviadas. As que já foram entregues não voltam atrás.",
      );
      if (!ok) return;
    }
    setAgindo(id);
    try {
      await mudar({ data: { tenantId, campaignId: id, acao } });
      toast.success(
        acao === "pausar"
          ? "Campanha pausada"
          : acao === "retomar"
            ? "Campanha retomada"
            : "Campanha cancelada",
      );
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui fazer isso agora");
    } finally {
      setAgindo(null);
    }
  }

  if (criando) {
    return (
      <AssistenteCampanha
        tenantId={tenantId}
        nomeRestaurante={nomeRestaurante}
        aoFechar={() => setCriando(false)}
        aoConcluir={() => {
          setCriando(false);
          void carregar();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCriando(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      {carregando && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!carregando && campanhas.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">Nenhuma campanha ainda</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              A primeira costuma ser a mais fácil: escolher quem sumiu há 30 dias e mandar um motivo
              para voltar.
            </p>
            <Button className="mt-5" onClick={() => setCriando(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Criar a primeira
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {campanhas.map((c) => {
          const estado = ESTADOS[c.status] ?? ESTADOS.draft;
          const podePausar = c.status === "queued" || c.status === "processing";
          const podeRetomar = c.status === "paused";
          const podeCancelar = ["queued", "processing", "paused", "scheduled"].includes(c.status);
          const naFila = Math.max(0, c.estimated_recipients - c.sent_count - c.failed_count);

          return (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{c.name}</h3>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${estado.cor}`}
                      >
                        {estado.rotulo}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {estado.explicacao}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {podePausar && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={agindo === c.id}
                        onClick={() => acao(c.id, "pausar")}
                      >
                        <Pause className="mr-1 h-3.5 w-3.5" />
                        Pausar
                      </Button>
                    )}
                    {podeRetomar && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={agindo === c.id}
                        onClick={() => acao(c.id, "retomar")}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        Retomar
                      </Button>
                    )}
                    {podeCancelar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={agindo === c.id}
                        onClick={() => acao(c.id, "cancelar")}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
                  <Numero rotulo="Público" valor={c.estimated_recipients} />
                  <Numero rotulo="Enviadas" valor={c.sent_count} />
                  <Numero rotulo="Chegaram" valor={c.delivered_count} destaque />
                  <Numero
                    rotulo={naFila > 0 ? "Faltam sair" : "Falharam"}
                    valor={naFila > 0 ? naFila : c.failed_count}
                    alerta={naFila === 0 && c.failed_count > 0}
                  />
                </div>

                {c.coupon_code && (
                  <p className="text-xs text-muted-foreground">
                    Cupom divulgado: <span className="font-mono font-bold">{c.coupon_code}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  destaque = false,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={`text-xl font-bold tabular-nums ${
          alerta ? "text-destructive" : destaque ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

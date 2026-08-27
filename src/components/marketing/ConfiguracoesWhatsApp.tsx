import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Smartphone, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { statusWhatsApp } from "@/lib/marketing/marketing.functions";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";

/**
 * A tela de conexão do WhatsApp.
 *
 * O QUE ELA FAZ HOJE, COM HONESTIDADE
 *
 * Ela MOSTRA o estado da conexão. Ela ainda não CONECTA — quem conecta o
 * aparelho ao WhatsApp é o n8n, do lado de fora. Os botões de conectar e
 * desconectar só fazem sentido depois que essa ligação existir, então eles
 * não estão aqui fingindo funcionar. Botão que não faz nada é pior que botão
 * que não existe: o dono clica, não acontece nada, e ele conclui que o
 * sistema está quebrado.
 *
 * Quando a integração estiver de pé, o estado passa a chegar sozinho e os
 * botões entram.
 */

type Estado = Awaited<ReturnType<typeof statusWhatsApp>>;
type ErroRecente = {
  error_code: string | null;
  error_message: string | null;
  failed_at: string | null;
};

const TEXTOS: Record<string, { titulo: string; explicacao: string; cor: string }> = {
  connected: {
    titulo: "WhatsApp conectado",
    explicacao: "Suas campanhas saem normalmente.",
    cor: "text-emerald-600 dark:text-emerald-400",
  },
  connecting: {
    titulo: "Conectando…",
    explicacao: "A ligação está sendo feita. Aguarde um instante.",
    cor: "text-amber-600 dark:text-amber-400",
  },
  disconnected: {
    titulo: "WhatsApp desconectado",
    explicacao:
      "Nada se perde: as mensagens ficam esperando na fila e saem quando a conexão voltar.",
    cor: "text-muted-foreground",
  },
  error: {
    titulo: "Problema na conexão",
    explicacao: "O WhatsApp recusou a ligação. Pode ser preciso ler o QR Code de novo.",
    cor: "text-destructive",
  },
};

export function ConfiguracoesWhatsApp({ tenantId }: { tenantId: string }) {
  const buscar = useServerFn(statusWhatsApp);
  const [dados, setDados] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      setDados(await buscar({ data: { tenantId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ler o status");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (carregando && !dados) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = dados?.instancia?.status ?? "disconnected";
  const t = TEXTOS[status] ?? TEXTOS.disconnected;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Smartphone className={`mt-0.5 h-6 w-6 ${t.cor}`} />
              <div>
                <h3 className={`font-semibold ${t.cor}`}>{t.titulo}</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{t.explicacao}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <Linha
              rotulo="Número conectado"
              valor={
                dados?.instancia?.phone_e164
                  ? formatPhoneForDisplay(dados.instancia.phone_e164)
                  : "—"
              }
            />
            <Linha rotulo="Fornecedor" valor={dados?.instancia?.provider ?? "—"} />
            <Linha
              rotulo="Última verificação"
              valor={
                dados?.instancia?.last_synced_at
                  ? new Date(dados.instancia.last_synced_at).toLocaleString("pt-BR")
                  : "Nunca"
              }
            />
            <Linha
              rotulo="Última mensagem"
              valor={
                dados?.instancia?.last_message_at
                  ? new Date(dados.instancia.last_message_at).toLocaleString("pt-BR")
                  : "Nenhuma ainda"
              }
            />
          </dl>
        </CardContent>
      </Card>

      {!dados?.instancia && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
            <div>
              <h3 className="font-semibold">O envio ainda não está ligado</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Você já pode montar campanhas e ver seu público — tudo isso funciona. O que falta é
                a ponte que leva a mensagem até o WhatsApp, que é configurada por fora do painel.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Enquanto ela não existir, as campanhas ficam guardadas na fila em vez de se
                perderem. No dia em que a ponte subir, elas saem.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(dados?.errosRecentes.length ?? 0) > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Últimas mensagens que não chegaram</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Quase sempre é número errado ou WhatsApp desconectado na hora.
            </p>
            <ul className="mt-3 space-y-2">
              {dados!.errosRecentes.map((e: ErroRecente, i: number) => (
                <li key={i} className="rounded-md border p-2.5 text-sm">
                  <span className="font-medium">{e.error_message || "Falha no envio"}</span>
                  {e.error_code && (
                    <span className="ml-2 text-xs text-muted-foreground">({e.error_code})</span>
                  )}
                  {e.failed_at && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(e.failed_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 font-medium">{valor}</dd>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { statusWhatsApp } from "@/lib/marketing/marketing.functions";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import { ConexaoWhatsApp } from "@/components/whatsapp/ConexaoWhatsApp";

/**
 * A tela de conexão do WhatsApp, no Marketing.
 *
 * O QUE MUDOU AQUI
 *
 * Antes esta tela só MOSTRAVA o estado: conectar era tarefa de alguém de fora.
 * Agora o próprio lojista conecta, pelo mesmo componente usado no Chat — é o
 * mesmo aparelho, o mesmo número, a mesma tela. Duas telas diferentes para
 * ligar o mesmo WhatsApp seriam duas agendas com o mesmo telefone: uma hora
 * alguém atualiza só uma.
 *
 * Abaixo da conexão fica o diagnóstico das campanhas, que é só do Marketing:
 * quantas falharam e por quê.
 */

type Estado = Awaited<ReturnType<typeof statusWhatsApp>>;
type ErroRecente = {
  error_code: string | null;
  error_message: string | null;
  failed_at: string | null;
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

  return (
    <div className="space-y-4">
      {/* Ligar/desligar o aparelho: o mesmo componente que o Chat usa. */}
      <ConexaoWhatsApp tenantId={tenantId} />

      {/* Só o diagnóstico: quem manda no estado da conexão é o quadro acima.
          Repetir "conectado/desconectado" em dois lugares da mesma tela é
          pedir para os dois discordarem um dia. */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <h3 className="font-semibold">Detalhes do envio</h3>

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

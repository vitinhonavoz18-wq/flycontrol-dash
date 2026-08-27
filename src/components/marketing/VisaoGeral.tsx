import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, ShieldCheck, Send, CheckCheck, Megaphone, Smartphone } from "lucide-react";
import { resumoMarketing } from "@/lib/marketing/marketing.functions";
import { toast } from "sonner";

/**
 * A primeira tela do Marketing.
 *
 * Ela responde três perguntas, nesta ordem: quantos clientes eu tenho, para
 * quantos eu posso mandar, e o WhatsApp está no ar?
 *
 * Não tem gráfico. Um gráfico de linha com dois pontos não informa nada — só
 * ocupa espaço e dá ar de relatório. Quando houver histórico suficiente para
 * uma linha dizer alguma coisa, ela entra.
 */

type Props = { tenantId: string; aoTrocarAba: (aba: string) => void };

type Resumo = Awaited<ReturnType<typeof resumoMarketing>>;

export function VisaoGeral({ tenantId, aoTrocarAba }: Props) {
  const buscar = useServerFn(resumoMarketing);
  const [dados, setDados] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setFalhou(false);
    buscar({ data: { tenantId } })
      .then((r) => {
        if (!cancelado) setDados(r);
      })
      .catch((e: Error) => {
        if (cancelado) return;
        setFalhou(true);
        toast.error(e.message);
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [tenantId, buscar, tentativa]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando…
      </div>
    );
  }

  // Tela em branco é o pior desfecho possível: o dono não sabe se o sistema
  // quebrou, se ele não tem cliente nenhum ou se a internet caiu. Sempre
  // dizer o que houve e oferecer o botão de tentar de novo.
  if (falhou || !dados) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-8 text-center">
          <h3 className="font-semibold">Não consegui carregar seus números agora</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Isso costuma ser conexão. Seus dados estão salvos — nada se perdeu.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const semNinguem = dados.aptos === 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          icone={<Users className="h-4 w-4" />}
          rotulo="Clientes no total"
          valor={dados.totalClientes.toLocaleString("pt-BR")}
          detalhe="Todo mundo que já pediu com telefone válido"
        />
        <Cartao
          icone={<ShieldCheck className="h-4 w-4" />}
          rotulo="Podem receber ofertas"
          valor={dados.aptos.toLocaleString("pt-BR")}
          detalhe="Só quem marcou que aceita, no site"
          destaque={dados.aptos > 0}
        />
        <Cartao
          icone={<Megaphone className="h-4 w-4" />}
          rotulo="Campanhas feitas"
          valor={String(dados.campanhasFeitas)}
          detalhe="Disparadas até hoje"
        />
        <Cartao
          icone={<Send className="h-4 w-4" />}
          rotulo="Mensagens enviadas"
          valor={dados.mensagensEnviadas.toLocaleString("pt-BR")}
          detalhe={
            dados.taxaEntrega === null
              ? "Nenhum envio ainda"
              : `${dados.taxaEntrega}% chegaram no celular`
          }
        />
      </div>

      {/* O caso mais comum no primeiro dia: a base existe, mas ninguém
          autorizou ainda. Sem explicar isso, o dono acha que o sistema está
          quebrado — os números não batem entre si. */}
      {semNinguem && dados.totalClientes > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-5">
            <h3 className="font-semibold">
              Você tem {dados.totalClientes.toLocaleString("pt-BR")} clientes, mas ainda não pode
              mandar promoção para ninguém
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Só entra na lista de disparo quem marcou, no site de pedidos, que quer receber
              ofertas. Seus clientes antigos nunca viram essa pergunta — ela é nova. A partir de
              agora, a cada pedido, quem marcar entra automaticamente.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              É a diferença entre ter o telefone de alguém porque ele pediu uma pizza e ter
              permissão para mandar propaganda. Mandar sem permissão é o caminho mais rápido para o
              seu WhatsApp ser denunciado e bloqueado.
            </p>
          </CardContent>
        </Card>
      )}

      {dados.totalClientes === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">Seu caderno de clientes ainda está vazio</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ele se preenche sozinho: cada pedido que entra pelo site com telefone válido vira um
              cliente aqui, sem você digitar nada.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <Smartphone
            className={`h-5 w-5 ${
              dados.whatsappStatus === "connected" ? "text-emerald-500" : "text-muted-foreground"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {dados.whatsappStatus === "connected"
                ? "WhatsApp conectado"
                : "WhatsApp desconectado"}
            </p>
            <p className="text-sm text-muted-foreground">
              {dados.whatsappStatus === "connected"
                ? "Suas campanhas saem normalmente."
                : "Enquanto estiver desconectado, as mensagens ficam esperando na fila em vez de se perderem."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => aoTrocarAba("config")}>
            Ver conexão
          </Button>
        </CardContent>
      </Card>

      {dados.aptos > 0 && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => aoTrocarAba("campanhas")}>Criar uma campanha</Button>
          <Button variant="outline" onClick={() => aoTrocarAba("clientes")}>
            Ver meus clientes
          </Button>
        </div>
      )}
    </div>
  );
}

function Cartao({
  icone,
  rotulo,
  valor,
  detalhe,
  destaque = false,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-primary/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icone}
          {rotulo}
        </div>
        <p className={`mt-2 text-3xl font-bold ${destaque ? "text-primary" : ""}`}>{valor}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

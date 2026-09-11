import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { definirChatDaLoja, configurarFluxoN8n } from "@/lib/crm/addonAdmin.functions";
import type { SituacaoChatDaLoja } from "@/lib/crm/addonAdmin.functions";

/**
 * O controle do Chat de uma loja, na tela do administrador.
 *
 * O CAMINHO COMPLETO DE UMA VENDA DO CRM, EM TRÊS CLIQUES
 *
 *   1. "Ativar" — o cliente passa a ver o Chat funcionando na hora, sem
 *      precisar sair e entrar de novo no painel.
 *   2. "Conexão" — você duplica o fluxo-modelo no n8n, cola aqui o nome dele
 *      e recebe a SENHA daquela loja.
 *   3. Cola a senha no fluxo do n8n. Pronto: as mensagens começam a entrar.
 *
 * A SENHA APARECE UMA VEZ SÓ. É de propósito: guardada de um jeito que nem
 * nós conseguimos mostrar de novo. Se perder, gere outra — e lembre que a
 * antiga para de valer na hora, então o fluxo precisa ser atualizado.
 */

export function ChatAddonActions({
  tenantId,
  planoEhCents,
  situacao,
  onMudou,
}: {
  tenantId: string;
  planoEhCents: boolean;
  situacao: SituacaoChatDaLoja | undefined;
  onMudou: () => void;
}) {
  const definir = useServerFn(definirChatDaLoja);
  const configurar = useServerFn(configurarFluxoN8n);

  const [salvando, setSalvando] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [nomeFluxo, setNomeFluxo] = useState(situacao?.workflowName ?? "");
  const [idFluxo, setIdFluxo] = useState("");
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState(false);

  const contratado = Boolean(situacao?.contratado);

  // Plano CENTS não tem a aba de jeito nenhum — ligar o recurso ali não
  // faria nada além de criar uma expectativa que o sistema depois nega.
  if (planoEhCents) {
    return <span className="text-xs text-muted-foreground">Só no Premium</span>;
  }

  async function alternar() {
    setSalvando(true);
    try {
      await definir({ data: { tenantId, ativo: !contratado } });
      toast.success(
        contratado
          ? "Chat desligado. As conversas continuam guardadas."
          : "Chat ativado para esta loja.",
      );
      onMudou();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar o Chat.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFluxo() {
    setConfigurando(true);
    try {
      const r = await configurar({
        data: {
          tenantId,
          workflowName: nomeFluxo || undefined,
          workflowId: idFluxo || undefined,
          // Loja sem conexão ainda: o servidor sorteia a senha sozinho, por
          // não existir nenhuma. Loja que já tem: só troca se você pedir — e
          // é exatamente isso que o botão "Gerar nova senha" faz.
          gerarNovaSenha: Boolean(situacao?.fluxoConfigurado),
        },
      });
      if (r.senha) {
        setSenhaGerada(r.senha);
        toast.success("Conexão criada. Copie a senha agora — ela não aparece de novo.");
      } else {
        toast.success("Conexão atualizada.");
        setDialogoAberto(false);
      }
      onMudou();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a conexão.");
    } finally {
      setConfigurando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={contratado ? "default" : "outline"} className="gap-1">
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        {contratado ? "Ativo" : "Desligado"}
      </Badge>

      {contratado && !situacao?.fluxoConfigurado && (
        <Badge variant="destructive" className="text-[10px]">
          sem conexão
        </Badge>
      )}

      <Button variant="outline" size="sm" onClick={() => void alternar()} disabled={salvando}>
        {salvando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        {contratado ? "Desligar" : "Ativar"}
      </Button>

      {contratado && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSenhaGerada(null);
            setDialogoAberto(true);
          }}
        >
          Conexão
        </Button>
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conexão com o n8n</DialogTitle>
            <DialogDescription>
              Duplique o fluxo-modelo no n8n para esta loja, anote o nome dele aqui e use a senha
              gerada dentro do fluxo. Cada loja tem a sua senha — é ela que impede um fluxo de
              alcançar as conversas de outro restaurante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome-fluxo">Nome do fluxo no n8n</Label>
              <Input
                id="nome-fluxo"
                value={nomeFluxo}
                onChange={(e) => setNomeFluxo(e.target.value)}
                placeholder="CRM — Pizzaria do Zé"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-fluxo">ID do fluxo (opcional)</Label>
              <Input
                id="id-fluxo"
                value={idFluxo}
                onChange={(e) => setIdFluxo(e.target.value)}
                placeholder="Aparece na barra de endereço do n8n"
              />
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-semibold">Identificação da loja (tenant_id)</p>
              <code className="break-all">{tenantId}</code>
            </div>

            {senhaGerada && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Copie agora — esta senha não aparece de novo.
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-[11px]">{senhaGerada}</code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    aria-label="Copiar senha"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(senhaGerada)
                        .then(() => toast.success("Senha copiada."))
                        .catch(() => toast.error("Copie manualmente."));
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAberto(false)}>
              {senhaGerada ? "Fechar" : "Cancelar"}
            </Button>
            <Button onClick={() => void salvarFluxo()} disabled={configurando}>
              {configurando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {situacao?.fluxoConfigurado ? "Gerar nova senha" : "Criar conexão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

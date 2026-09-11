import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  listarConversas,
  listarMensagens,
  enviarMensagem,
  marcarComoLida,
  alterarStatusConversa,
  iniciarConversa,
  statusDaIntegracao,
  type ConversaCrm,
  type MensagemCrm,
} from "@/lib/crm/crm.functions";
import { ListaConversas } from "./ListaConversas";
import { JanelaConversa } from "./JanelaConversa";
import { AvisoIntegracao, type StatusIntegracao } from "./AvisoIntegracao";

/**
 * O Chat montado: lista à esquerda, conversa à direita.
 *
 * NO CELULAR É UMA TELA DE CADA VEZ. Espremer as duas colunas numa tela de
 * 390px transforma as duas em ilegíveis — então a lista ocupa tudo até
 * alguém escolher uma conversa, e aí a conversa ocupa tudo, com um botão de
 * voltar. É como o próprio WhatsApp funciona no telefone.
 *
 * SE A INTERNET OU O n8n CAÍREM, a tela não quebra: o histórico que já veio
 * continua na frente, a tarja de cima explica o que está acontecendo e o que
 * a pessoa escrever fica guardado para sair depois.
 */

const INTERVALO_STATUS_MS = 60_000;

export function ChatCrm({ tenantId }: { tenantId: string }) {
  const buscarConversas = useServerFn(listarConversas);
  const buscarMensagens = useServerFn(listarMensagens);
  const enviar = useServerFn(enviarMensagem);
  const marcarLida = useServerFn(marcarComoLida);
  const mudarStatus = useServerFn(alterarStatusConversa);
  const criarConversa = useServerFn(iniciarConversa);
  const buscarStatus = useServerFn(statusDaIntegracao);

  const [conversas, setConversas] = useState<ConversaCrm[]>([]);
  const [mensagens, setMensagens] = useState<MensagemCrm[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [integracao, setIntegracao] = useState<StatusIntegracao | null>(null);
  const [carregandoIntegracao, setCarregandoIntegracao] = useState(true);
  const [novaAberta, setNovaAberta] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);

  // A conversa aberta agora, guardada fora do estado da tela: os avisos do
  // banco em tempo real chegam de fora do React e precisam saber qual
  // conversa está na frente sem virar dependência de efeito.
  const selecionadaRef = useRef<string | null>(null);
  selecionadaRef.current = selecionada;

  // Esperar a pessoa parar de digitar antes de buscar. Sem isso, "João" vira
  // quatro consultas ao servidor, uma por letra.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const carregarConversas = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregandoLista(true);
      try {
        const r = await buscarConversas({
          data: { tenantId, busca: buscaAplicada || undefined },
        });
        setConversas(r.conversas);
      } catch (e: unknown) {
        // Falha ao atualizar não apaga o que já está na tela. O lojista
        // continua lendo o histórico enquanto a rede não volta.
        if (!silencioso) {
          toast.error(e instanceof Error ? e.message : "Não foi possível carregar as conversas.");
        }
      } finally {
        setCarregandoLista(false);
      }
    },
    [buscarConversas, tenantId, buscaAplicada],
  );

  const carregarMensagens = useCallback(
    async (conversationId: string, silencioso = false) => {
      if (!silencioso) setCarregandoMensagens(true);
      try {
        const r = await buscarMensagens({ data: { tenantId, conversationId } });
        setMensagens(r.mensagens);
      } catch (e: unknown) {
        if (!silencioso) {
          toast.error(e instanceof Error ? e.message : "Não foi possível abrir a conversa.");
        }
      } finally {
        setCarregandoMensagens(false);
      }
    },
    [buscarMensagens, tenantId],
  );

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  useEffect(() => {
    if (!selecionada) {
      setMensagens([]);
      return;
    }
    void carregarMensagens(selecionada);
    void marcarLida({ data: { tenantId, conversationId: selecionada } })
      .then(() =>
        setConversas((atual) =>
          atual.map((c) => (c.id === selecionada ? { ...c, unread_count: 0 } : c)),
        ),
      )
      .catch(() => {
        /* marcar como lida é conveniência: falhar aqui não atrapalha o
           atendimento e não vale um alerta na cara do lojista. */
      });
  }, [selecionada, carregarMensagens, marcarLida, tenantId]);

  // Mensagem nova acende na tela sozinha. Sem isso o lojista teria de ficar
  // apertando F5 — e um cliente esperando resposta não espera F5.
  useEffect(() => {
    const canal = supabase
      .channel(`crm-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_messages",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const linha = (payload.new ?? {}) as { conversation_id?: string };
          if (linha.conversation_id && linha.conversation_id === selecionadaRef.current) {
            void carregarMensagens(linha.conversation_id, true);
          }
          void carregarConversas(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [tenantId, carregarMensagens, carregarConversas]);

  // A saúde da conexão é conferida de minuto em minuto. É barato e é o que
  // permite avisar cedo que o WhatsApp caiu.
  useEffect(() => {
    let vivo = true;
    async function conferir() {
      try {
        const r = await buscarStatus({ data: { tenantId } });
        if (vivo) setIntegracao(r);
      } catch {
        // Não conseguir conferir não é o mesmo que estar fora do ar: fica
        // quieto em vez de acusar uma queda que pode não existir.
      } finally {
        if (vivo) setCarregandoIntegracao(false);
      }
    }
    void conferir();
    const t = setInterval(conferir, INTERVALO_STATUS_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [buscarStatus, tenantId]);

  const conversaAberta = useMemo(
    () => conversas.find((c) => c.id === selecionada) ?? null,
    [conversas, selecionada],
  );

  async function aoEnviar(texto: string) {
    if (!selecionada) return;
    setEnviando(true);
    try {
      const r = await enviar({ data: { tenantId, conversationId: selecionada, texto } });
      setMensagens((atual) => [...atual, r.mensagem]);
      void carregarConversas(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
      throw e;
    } finally {
      setEnviando(false);
    }
  }

  async function aoMudarStatus(status: "open" | "pending" | "closed") {
    if (!selecionada) return;
    const anterior = conversas;
    setConversas((atual) => atual.map((c) => (c.id === selecionada ? { ...c, status } : c)));
    try {
      await mudarStatus({ data: { tenantId, conversationId: selecionada, status } });
    } catch (e: unknown) {
      setConversas(anterior);
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar a situação.");
    }
  }

  async function aoCriarConversa() {
    setCriando(true);
    try {
      const r = await criarConversa({
        data: { tenantId, telefone: novoTelefone, nome: novoNome || undefined },
      });
      setNovaAberta(false);
      setNovoTelefone("");
      setNovoNome("");
      await carregarConversas(true);
      setSelecionada(r.conversationId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a conversa.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col md:h-[calc(100dvh-2rem)]">
      <AvisoIntegracao status={integracao} carregando={carregandoIntegracao} />

      <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
        {/* No celular, uma tela de cada vez. */}
        <div className={`min-h-0 ${selecionada ? "hidden md:block" : "block"}`}>
          <ListaConversas
            conversas={conversas}
            carregando={carregandoLista}
            selecionada={selecionada}
            busca={busca}
            onBusca={setBusca}
            onSelecionar={setSelecionada}
            onNova={() => setNovaAberta(true)}
          />
        </div>

        <div className={`min-h-0 ${selecionada ? "block" : "hidden md:block"}`}>
          {selecionada && (
            <div className="border-b border-border p-2 md:hidden">
              <Button variant="ghost" size="sm" onClick={() => setSelecionada(null)}>
                ← Todas as conversas
              </Button>
            </div>
          )}
          <JanelaConversa
            conversa={conversaAberta}
            mensagens={mensagens}
            carregando={carregandoMensagens}
            enviando={enviando}
            onEnviar={aoEnviar}
            onMudarStatus={aoMudarStatus}
          />
        </div>
      </div>

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Digite o celular do cliente com DDD. Se ele já falou com a loja antes, a conversa
              antiga é reaberta com todo o histórico — não vira um cliente novo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(e.target.value)}
              placeholder="(71) 99999-9999"
              inputMode="tel"
              aria-label="Telefone do cliente"
            />
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome (opcional)"
              aria-label="Nome do cliente"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaAberta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void aoCriarConversa()}
              disabled={criando || !novoTelefone.trim()}
            >
              {criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

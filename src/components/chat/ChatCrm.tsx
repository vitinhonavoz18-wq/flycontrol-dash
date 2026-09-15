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
import { useAuth } from "@/lib/auth";
import {
  listarConversas,
  listarMensagens,
  enviarMensagem,
  marcarComoLida,
  alterarStatusConversa,
  iniciarConversa,
  renomearContato,
  rascunhoDaConversa,
  decidirRascunho,
  statusDaIntegracao,
  type ConversaCrm,
  type MensagemCrm,
  type RascunhoPedido,
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
 *
 * A ALTURA VEM DE FORA. Esta peça ocupa 100% do espaço que a aba Chat reservou
 * para ela (`h-full`) e não tenta adivinhar o tamanho da tela. Enquanto ela
 * mesma calculava — "a tela menos 4rem" — qualquer mudança no cabeçalho do
 * painel fazia a caixa de escrever cair para fora da tela no celular.
 */

const INTERVALO_STATUS_MS = 60_000;

export function ChatCrm({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const buscarConversas = useServerFn(listarConversas);
  const buscarMensagens = useServerFn(listarMensagens);
  const enviar = useServerFn(enviarMensagem);
  const marcarLida = useServerFn(marcarComoLida);
  const mudarStatus = useServerFn(alterarStatusConversa);
  const criarConversa = useServerFn(iniciarConversa);
  const buscarStatus = useServerFn(statusDaIntegracao);
  const renomear = useServerFn(renomearContato);
  const buscarRascunho = useServerFn(rascunhoDaConversa);
  const decidir = useServerFn(decidirRascunho);

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
  const [nomeAberto, setNomeAberto] = useState(false);
  const [nomeEditado, setNomeEditado] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoPedido | null>(null);

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

  // O pedido que a IA montou para ESTA conversa. Recarregado junto das
  // mensagens e sempre que o banco avisar que algo mudou.
  const carregarRascunho = useCallback(
    async (conversationId: string) => {
      try {
        const r = await buscarRascunho({ data: { tenantId, conversationId } });
        setRascunho(r.rascunho);
      } catch {
        // Não conseguir ler o rascunho não pode derrubar a conversa: o
        // atendimento continua, só o cartão de pedido não aparece.
      }
    },
    [buscarRascunho, tenantId],
  );

  useEffect(() => {
    if (!selecionada) {
      setMensagens([]);
      setRascunho(null);
      return;
    }
    void carregarRascunho(selecionada);
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
  }, [selecionada, carregarMensagens, carregarRascunho, marcarLida, tenantId]);

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

    const canalPedidos = supabase
      .channel(`crm-rascunhos-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_order_drafts",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const linha = (payload.new ?? payload.old ?? {}) as { conversation_id?: string };
          if (linha.conversation_id && linha.conversation_id === selecionadaRef.current) {
            void carregarRascunho(linha.conversation_id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
      supabase.removeChannel(canalPedidos);
    };
  }, [tenantId, carregarMensagens, carregarConversas, carregarRascunho]);

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

  async function aoDecidirRascunho(decisao: "confirmar" | "recusar") {
    if (!rascunho) return;
    try {
      const r = await decidir({ data: { tenantId, rascunhoId: rascunho.id, decisao } });
      setRascunho(null);
      if (r.status === "confirmado") {
        toast.success(
          r.numero ? `Pedido #${r.numero} criado.` : "Pedido criado e enviado para a cozinha.",
        );
      } else {
        toast.success("Pedido descartado.");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível decidir o pedido.");
      // A decisão falhou: o cartão volta, para ninguém achar que resolveu.
      if (selecionada) void carregarRascunho(selecionada);
    }
  }

  function abrirCorrecaoDeNome() {
    setNomeEditado(conversaAberta?.contato?.name ?? "");
    setNomeAberto(true);
  }

  async function aoSalvarNome() {
    const customerId = conversaAberta?.contato?.id;
    if (!customerId) return;
    setSalvandoNome(true);
    try {
      const r = await renomear({
        data: { tenantId, customerId, nome: nomeEditado },
      });
      // A ficha é a mesma do Marketing, então a tela inteira passa a mostrar o
      // nome novo sem precisar recarregar nada do servidor.
      setConversas((atual) =>
        atual.map((c) =>
          c.contato?.id === customerId ? { ...c, contato: { ...c.contato, name: r.nome } } : c,
        ),
      );
      setNomeAberto(false);
      toast.success(r.nome ? "Nome corrigido." : "Nome apagado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o nome.");
    } finally {
      setSalvandoNome(false);
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
    <div className="flex h-full min-h-0 flex-col">
      <AvisoIntegracao status={integracao} carregando={carregandoIntegracao} />

      {/* `grid-rows-[1fr]` não é enfeite. Sem ele a linha da grade cresce junto
          com a conversa mais longa — e a caixa de escrever é empurrada para
          fora da tela, exatamente o que a gente queria evitar. Com uma linha de
          altura fixa, quem cresce demais é obrigado a rolar por dentro. */}
      <div className="grid min-h-0 flex-1 grid-rows-[1fr] overflow-hidden md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        {/* No celular, uma tela de cada vez. */}
        <div className={`h-full min-h-0 min-w-0 ${selecionada ? "hidden md:block" : "block"}`}>
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

        <div className={`min-h-0 min-w-0 flex-col ${selecionada ? "flex" : "hidden md:flex"}`}>
          {selecionada && (
            <div className="shrink-0 border-b-2 border-border bg-card px-2 py-1.5 md:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="font-semibold"
                onClick={() => setSelecionada(null)}
              >
                ← Todas as conversas
              </Button>
            </div>
          )}
          {/* `min-h-0 flex-1` em vez de `h-full`: com o botão "voltar" em cima,
              100% da altura do pai seria alto DEMAIS e empurraria a caixa de
              escrever para fora da tela no celular. */}
          <div className="min-h-0 flex-1">
            <JanelaConversa
              meuUserId={user?.id ?? null}
              conversa={conversaAberta}
              mensagens={mensagens}
              carregando={carregandoMensagens}
              enviando={enviando}
              onEnviar={aoEnviar}
              onMudarStatus={aoMudarStatus}
              onCorrigirNome={abrirCorrecaoDeNome}
              rascunho={rascunho}
              onDecidirRascunho={aoDecidirRascunho}
            />
          </div>
        </div>
      </div>

      <Dialog open={nomeAberto} onOpenChange={setNomeAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nome do cliente</DialogTitle>
            <DialogDescription>
              O WhatsApp nem sempre manda o nome certo. O que você escrever aqui passa a valer, e o
              WhatsApp não sobrescreve mais. É o mesmo cadastro que o Marketing usa: corrigir aqui
              corrige lá também. Deixe em branco para voltar a usar o nome do WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nomeEditado}
            onChange={(e) => setNomeEditado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void aoSalvarNome();
              }
            }}
            placeholder="Nome do cliente"
            maxLength={120}
            aria-label="Nome do cliente"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNomeAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void aoSalvarNome()} disabled={salvandoNome}>
              {salvandoNome && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

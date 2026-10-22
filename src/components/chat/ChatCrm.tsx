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
  pedidoDaConversa,
  cancelarPedidoDoChat,
  statusDaIntegracao,
  carregarMidia,
  reenviarMensagem,
  atualizarFichaDoCliente,
  type ConversaCrm,
  type MensagemCrm,
  type PedidoDoChat,
} from "@/lib/crm/crm.functions";
import type { ArquivoParaEnviar } from "@/lib/crm/midiaNavegador";
import { criarMemoriaDeMidia, type ResultadoMidia } from "@/lib/crm/filaDeMidia";
import { mesclarMensagens } from "@/lib/crm/historico";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ListaConversas, type FiltroConversas } from "./ListaConversas";
import { PainelCliente } from "./PainelCliente";
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
const POR_PAGINA = 30;

/** As conversas em ordem: quem falou por último em cima, igual ao WhatsApp. */
function ordenarConversas(lista: ConversaCrm[]): ConversaCrm[] {
  return lista.slice().sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}

function passaNoFiltro(c: ConversaCrm, filtro: FiltroConversas): boolean {
  if (filtro === "nao_lidas") return c.unread_count > 0;
  if (filtro === "todas") return true;
  return c.status === filtro;
}

function paramsDoFiltro(filtro: FiltroConversas) {
  if (filtro === "nao_lidas") return { naoLidas: true };
  if (filtro === "todas") return {};
  return { status: filtro };
}

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
  const buscarPedido = useServerFn(pedidoDaConversa);
  const cancelarPedido = useServerFn(cancelarPedidoDoChat);
  const buscarMidia = useServerFn(carregarMidia);
  const reenviar = useServerFn(reenviarMensagem);
  const salvarFicha = useServerFn(atualizarFichaDoCliente);

  // Um "pegador de arquivos" por loja: cada arquivo é pedido uma vez só e no
  // máximo três ao mesmo tempo (ver `filaDeMidia.ts`).
  const obterMidia = useMemo(
    () =>
      criarMemoriaDeMidia(
        (messageId) => buscarMidia({ data: { tenantId, messageId } }) as Promise<ResultadoMidia>,
      ),
    [buscarMidia, tenantId],
  );

  // AMPLIAR: a conversa toma a tela inteira, por cima do painel. Não muda
  // nada do que está guardado — é só o tamanho da janela, como abrir o mapa
  // inteiro em vez de olhar pelo retrovisor.
  const [ampliado, setAmpliado] = useState(false);
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
  const [pedido, setPedido] = useState<PedidoDoChat | null>(null);
  const [filtro, setFiltro] = useState<FiltroConversas>("todas");
  const [pagina, setPagina] = useState(1);
  const [temMaisConversas, setTemMaisConversas] = useState(false);
  const [carregandoMaisConversas, setCarregandoMaisConversas] = useState(false);
  const [temMaisAntigas, setTemMaisAntigas] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);
  const qtdConversas = useRef(0);
  qtdConversas.current = conversas.length;

  // A conversa aberta agora, guardada fora do estado da tela: os avisos do
  // banco em tempo real chegam de fora do React e precisam saber qual
  // conversa está na frente sem virar dependência de efeito.
  const selecionadaRef = useRef<string | null>(null);
  selecionadaRef.current = selecionada;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendenteMensagens = useRef<string | null>(null);
  const marcarAoVer = useRef(false);

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
        // A atualização silenciosa (chegou mensagem) recarrega TUDO o que já
        // está na tela, até 100 — senão quem clicou em "carregar mais" veria
        // a lista encolher de volta para 30 a cada mensagem nova.
        const porPagina = silencioso
          ? Math.min(Math.max(qtdConversas.current, POR_PAGINA), 100)
          : POR_PAGINA;
        const r = await buscarConversas({
          data: {
            tenantId,
            busca: buscaAplicada || undefined,
            porPagina,
            ...paramsDoFiltro(filtro),
          },
        });
        if (silencioso) {
          setConversas((atual) => {
            const porId = new Map(atual.map((c) => [c.id, c]));
            for (const c of r.conversas) porId.set(c.id, c);
            return ordenarConversas(
              Array.from(porId.values()).filter(
                (c) => c.id === selecionadaRef.current || passaNoFiltro(c, filtro),
              ),
            );
          });
        } else {
          setConversas(r.conversas);
          setPagina(1);
          setTemMaisConversas(r.temMais);
        }
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
    [buscarConversas, tenantId, buscaAplicada, filtro],
  );

  async function carregarMaisConversas() {
    setCarregandoMaisConversas(true);
    try {
      const proxima = pagina + 1;
      const r = await buscarConversas({
        data: {
          tenantId,
          busca: buscaAplicada || undefined,
          pagina: proxima,
          porPagina: POR_PAGINA,
          ...paramsDoFiltro(filtro),
        },
      });
      setConversas((atual) => {
        const ids = new Set(atual.map((c) => c.id));
        return [...atual, ...r.conversas.filter((c) => !ids.has(c.id))];
      });
      setPagina(proxima);
      setTemMaisConversas(r.temMais);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar mais conversas.");
    } finally {
      setCarregandoMaisConversas(false);
    }
  }

  const carregarMensagens = useCallback(
    async (conversationId: string, silencioso = false) => {
      if (!silencioso) setCarregandoMensagens(true);
      try {
        const r = await buscarMensagens({ data: { tenantId, conversationId } });
        // A pessoa trocou de conversa enquanto a resposta vinha: a resposta
        // antiga não pode cair por cima da conversa nova.
        if (selecionadaRef.current !== conversationId) return;
        if (silencioso) {
          // Mesclar, e não substituir: as mensagens antigas que a pessoa
          // carregou continuam na tela, e nada aparece duas vezes.
          setMensagens((atual) => mesclarMensagens(atual, r.mensagens));
        } else {
          setMensagens(r.mensagens);
          setTemMaisAntigas(r.temMais);
        }
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

  async function carregarAntigas() {
    const conversationId = selecionada;
    const maisAntiga = mensagens[0];
    if (!conversationId || !maisAntiga) return;
    setCarregandoAntigas(true);
    try {
      const r = await buscarMensagens({
        data: { tenantId, conversationId, antesDe: maisAntiga.created_at },
      });
      if (selecionadaRef.current !== conversationId) return;
      setMensagens((atual) => mesclarMensagens(atual, r.mensagens));
      setTemMaisAntigas(r.temMais);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível carregar mensagens anteriores.",
      );
      throw e;
    } finally {
      setCarregandoAntigas(false);
    }
  }

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  // O pedido que a IA fez para ESTA conversa. Recarregado junto das mensagens
  // e sempre que o banco avisar que a situação dele mudou — assim o lojista vê
  // "em preparo" virar "saiu para entrega" sem apertar F5.
  const carregarPedido = useCallback(
    async (conversationId: string) => {
      try {
        const r = await buscarPedido({ data: { tenantId, conversationId } });
        setPedido(r.pedido);
      } catch {
        // Não conseguir ler o pedido não pode derrubar a conversa: o
        // atendimento continua, só o cartão não aparece.
      }
    },
    [buscarPedido, tenantId],
  );

  useEffect(() => {
    setMensagens([]);
    setTemMaisAntigas(false);
    if (!selecionada) {
      setPedido(null);
      return;
    }
    void carregarPedido(selecionada);
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
  }, [selecionada, carregarMensagens, carregarPedido, marcarLida, tenantId]);

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
          const linha = (payload.new ?? {}) as { conversation_id?: string; direction?: string };
          const aberta = selecionadaRef.current;
          const ehAberta = Boolean(linha.conversation_id && linha.conversation_id === aberta);

          // O cliente escreveu NA CONVERSA QUE ESTÁ ABERTA na frente do
          // atendente: ele já está vendo, então não pode virar "não lida".
          // Sem isso a bolinha acendia numa conversa que a pessoa estava lendo.
          if (
            ehAberta &&
            payload.eventType === "INSERT" &&
            linha.direction === "in" &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible"
          ) {
            marcarAoVer.current = true;
          }

          // VÁRIOS AVISOS JUNTOS VIRAM UMA ATUALIZAÇÃO SÓ. Abrir uma conversa
          // antiga traz várias fotos do WhatsApp, e cada uma gera um aviso;
          // sem juntar, a tela recarregaria dez vezes seguidas.
          if (ehAberta) pendenteMensagens.current = linha.conversation_id ?? null;
          if (temporizador.current) clearTimeout(temporizador.current);
          temporizador.current = setTimeout(() => {
            const conv = pendenteMensagens.current;
            pendenteMensagens.current = null;
            if (conv && conv === selecionadaRef.current) void carregarMensagens(conv, true);
            if (marcarAoVer.current && selecionadaRef.current) {
              marcarAoVer.current = false;
              const alvo = selecionadaRef.current;
              void marcarLida({ data: { tenantId, conversationId: alvo } })
                .catch(() => undefined)
                .finally(() => void carregarConversas(true));
            } else {
              void carregarConversas(true);
            }
          }, 400);
        },
      )
      .subscribe();

    // A tabela de pedidos é a MESMA do site. Ouvir aqui faz a situação mudar
    // sozinha na conversa quando a cozinha mexe no pedido lá na tela dela.
    const canalPedidos = supabase
      .channel(`crm-pedidos-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          if (selecionadaRef.current) void carregarPedido(selecionadaRef.current);
        },
      )
      .subscribe();

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      supabase.removeChannel(canal);
      supabase.removeChannel(canalPedidos);
    };
  }, [tenantId, carregarMensagens, carregarConversas, carregarPedido, marcarLida]);

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

  // A conversa aberta NÃO some da frente da pessoa porque saiu do filtro
  // (ex.: em "Não lidas", ela vira lida assim que é aberta). A lista pode
  // escondê-la; a janela da conversa continua com ela.
  const ultimaAberta = useRef<ConversaCrm | null>(null);
  const conversaAberta = useMemo(() => {
    const achada = conversas.find((c) => c.id === selecionada) ?? null;
    if (achada) return achada;
    return ultimaAberta.current?.id === selecionada ? ultimaAberta.current : null;
  }, [conversas, selecionada]);
  ultimaAberta.current = conversaAberta;

  async function aoEnviar(texto: string, arquivo?: ArquivoParaEnviar | null) {
    if (!selecionada) return;
    setEnviando(true);
    try {
      const r = await enviar({
        data: {
          tenantId,
          conversationId: selecionada,
          texto,
          arquivo: arquivo
            ? { nome: arquivo.nome, mime: arquivo.mime, base64: arquivo.base64 }
            : null,
        },
      });
      // Mesclar pelo número da mensagem: se o aviso em tempo real chegou antes
      // desta resposta, a mensagem já está na tela e não aparece duas vezes.
      setMensagens((atual) => mesclarMensagens(atual, [r.mensagem]));
      void carregarConversas(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
      throw e;
    } finally {
      setEnviando(false);
    }
  }

  async function aoReenviar(messageId: string) {
    try {
      await reenviar({ data: { tenantId, messageId } });
      setMensagens((atual) =>
        atual.map((m) =>
          m.id === messageId ? { ...m, status: "queued", error_message: null } : m,
        ),
      );
      toast.success("Mensagem de volta na fila. Sai em até 1 minuto.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar.");
    }
  }

  async function aoSalvarFicha(mudanca: { tags?: string[]; notes?: string }) {
    const customerId = conversaAberta?.contato?.id;
    if (!customerId) return;
    const r = await salvarFicha({ data: { tenantId, customerId, ...mudanca } });
    setConversas((atual) =>
      atual.map((c) =>
        c.contato?.id === customerId
          ? { ...c, contato: { ...c.contato, tags: r.tags, notes: r.notes } }
          : c,
      ),
    );
    if (mudanca.notes !== undefined) toast.success("Anotação salva.");
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

  async function aoCancelarPedido() {
    if (!pedido) return;
    try {
      const r = await cancelarPedido({ data: { tenantId, pedidoId: pedido.id } });
      toast.success(r.numero ? `Pedido #${r.numero} cancelado.` : "Pedido cancelado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar o pedido.");
    } finally {
      // Dando certo ou não, a tela volta a mostrar o que o banco diz — nunca o
      // que a gente supôs que aconteceu.
      if (selecionada) void carregarPedido(selecionada);
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
    <div
      className={
        ampliado
          ? "fixed inset-0 z-50 flex min-h-0 flex-col bg-background"
          : "flex h-full min-h-0 flex-col"
      }
    >
      {!ampliado && <AvisoIntegracao status={integracao} carregando={carregandoIntegracao} />}

      {/* `grid-rows-[1fr]` não é enfeite. Sem ele a linha da grade cresce junto
          com a conversa mais longa — e a caixa de escrever é empurrada para
          fora da tela, exatamente o que a gente queria evitar. Com uma linha de
          altura fixa, quem cresce demais é obrigado a rolar por dentro. */}
      <div
        className={`grid min-h-0 flex-1 grid-rows-[1fr] overflow-hidden ${
          ampliado
            ? ""
            : `md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] ${
                conversaAberta ? "2xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_300px]" : ""
              }`
        }`}
      >
        {/* No celular, uma tela de cada vez. */}
        <div
          className={`h-full min-h-0 min-w-0 ${
            ampliado ? "hidden" : selecionada ? "hidden md:block" : "block"
          }`}
        >
          <ListaConversas
            conversas={conversas}
            carregando={carregandoLista}
            selecionada={selecionada}
            busca={busca}
            onBusca={setBusca}
            onSelecionar={setSelecionada}
            onNova={() => setNovaAberta(true)}
            filtro={filtro}
            onFiltro={setFiltro}
            temMais={temMaisConversas}
            carregandoMais={carregandoMaisConversas}
            onCarregarMais={() => void carregarMaisConversas()}
          />
        </div>

        <div className={`min-h-0 min-w-0 flex-col ${selecionada ? "flex" : "hidden md:flex"}`}>
          {selecionada && (
            <div className="shrink-0 border-b-2 border-border bg-card px-2 py-1.5 md:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="font-semibold"
                onClick={() => {
                  // Voltar para a lista desfaz o ampliado: com a conversa
                  // fechada, a tela cheia não teria nada para mostrar nem
                  // botão nenhum para sair dela.
                  setAmpliado(false);
                  setSelecionada(null);
                }}
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
              pedido={pedido}
              onCancelarPedido={aoCancelarPedido}
              ampliado={ampliado}
              onAmpliar={() => setAmpliado((a) => !a)}
              obterMidia={obterMidia}
              onReenviar={aoReenviar}
              temMaisAntigas={temMaisAntigas}
              carregandoAntigas={carregandoAntigas}
              onCarregarAntigas={carregarAntigas}
              onAbrirFicha={conversaAberta ? () => setFichaAberta(true) : undefined}
            />
          </div>
        </div>

        {/* A FICHA fica aberta ao lado na tela bem larga. Em telas menores ela
            abre como gaveta pelo botão do cabeçalho (ver abaixo). */}
        {conversaAberta && !ampliado && (
          <div className="hidden min-h-0 border-l-2 border-border 2xl:block">
            <PainelCliente
              conversa={conversaAberta}
              onSalvar={aoSalvarFicha}
              onCorrigirNome={abrirCorrecaoDeNome}
            />
          </div>
        )}
      </div>

      <Sheet open={fichaAberta && Boolean(conversaAberta)} onOpenChange={setFichaAberta}>
        <SheetContent side="right" className="w-[92vw] max-w-sm p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">Ficha do cliente</SheetTitle>
          {conversaAberta && (
            <PainelCliente
              conversa={conversaAberta}
              onSalvar={aoSalvarFicha}
              onCorrigirNome={abrirCorrecaoDeNome}
              onFechar={() => setFichaAberta(false)}
            />
          )}
        </SheetContent>
      </Sheet>

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

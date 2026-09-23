import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Send,
  Check,
  CheckCheck,
  AlertTriangle,
  Clock,
  Bot,
  Paperclip,
  Pencil,
  ShoppingBag,
  X,
  Maximize2,
  Minimize2,
  Hand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import { iaEstaPausada } from "@/lib/crm/pausaDaIa";
import {
  quemFalou,
  ladoDireito,
  NOME_AUTORIA,
  INICIAL_AUTORIA,
  type Autoria,
} from "@/lib/crm/autoria";
import type { ConversaCrm, MensagemCrm, PedidoDoChat } from "@/lib/crm/crm.functions";
import { CartaoPedido } from "./CartaoPedido";
import { BalaoMidia } from "./BalaoMidia";
import { GravadorDeAudio } from "./GravadorDeAudio";
import { conferirArquivo, ROTULO_MIDIA, ehTipoMidia } from "@/lib/crm/midia";
import {
  lerArquivoComoBase64,
  tamanhoLegivel,
  type ArquivoParaEnviar,
} from "@/lib/crm/midiaNavegador";

/**
 * A coluna da direita: a conversa aberta.
 *
 * TRÊS CORES, TRÊS BOCAS
 *
 *   cinza claro, à esquerda .... o cliente
 *   laranja, à direita ......... você
 *   grafite, à direita ......... alguém da sua equipe
 *   azul, à direita ............ a atendente IA
 *
 * Antes era tudo duas caixinhas iguais e ninguém sabia se a promessa feita ao
 * cliente saiu da IA ou de uma pessoa. É a comanda que passou a dizer o nome
 * do garçom: quando dá problema, dá para saber com quem falar.
 *
 * A TELA É TRAVADA, COMO A DO WHATSApp. O cabeçalho fica colado em cima, a
 * caixa de escrever colada embaixo, e SÓ o meio rola. Antes a página inteira
 * escorregava: a pessoa rolava para ler uma mensagem antiga e a caixa de
 * escrever sumia da tela.
 *
 * O QUE CADA MARQUINHA QUER DIZER
 *
 *   relógio  — está na fila, ainda não saiu
 *   ✓        — o WhatsApp pegou para entregar
 *   ✓✓       — entregue
 *   triângulo — não deu certo; o motivo aparece ao lado
 *
 * Sem isso, uma mensagem que falhou fica igual a uma entregue, e o lojista só
 * descobre o problema quando o cliente reclama que nunca respondeu.
 */

const ROTULO_STATUS_CONVERSA = [
  { valor: "open", rotulo: "Aberta" },
  { valor: "pending", rotulo: "Aguardando cliente" },
  { valor: "closed", rotulo: "Resolvida" },
];

/**
 * As cores de cada autor, em um lugar só.
 *
 * Tudo aqui é cor CHEIA, sem transparência. As caixas antigas usavam cores
 * aguadas (10% disto, 20% daquilo) e a tela inteira ficava com cara de
 * desbotada — foi exatamente a reclamação: "muito opaco".
 */
const ESTILO_BALAO: Record<Autoria, string> = {
  cliente:
    "bg-card text-card-foreground border border-border dark:bg-secondary dark:border-white/10",
  voce: "bg-primary text-primary-foreground",
  equipe: "bg-slate-700 text-white dark:bg-slate-600",
  ia: "bg-sky-600 text-white dark:bg-sky-600",
  celular: "bg-slate-700 text-white dark:bg-slate-600",
};

const ESTILO_AVATAR: Record<Autoria, string> = {
  cliente: "bg-muted text-foreground border border-border",
  voce: "bg-primary text-primary-foreground",
  equipe: "bg-slate-700 text-white dark:bg-slate-600",
  ia: "bg-sky-600 text-white",
  celular: "bg-slate-700 text-white dark:bg-slate-600",
};

const ESTILO_PONTO: Record<Autoria, string> = {
  cliente: "bg-muted-foreground",
  voce: "bg-primary",
  equipe: "bg-slate-700 dark:bg-slate-400",
  ia: "bg-sky-600",
  celular: "bg-slate-700 dark:bg-slate-400",
};

function MarcaDeEnvio({ status, erro }: { status: string; erro: string | null }) {
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 font-semibold" title={erro ?? "Falha no envio"}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        não enviada
      </span>
    );
  }
  if (status === "sent") return <CheckCheck className="h-3.5 w-3.5" aria-label="entregue" />;
  if (status === "sending") return <Check className="h-3.5 w-3.5" aria-label="saindo" />;
  return <Clock className="h-3.5 w-3.5" aria-label="na fila" />;
}

function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * "Hoje", "Ontem" ou a data. Sem essa faixa, uma conversa de três semanas vira
 * um rolo sem começo nem fim e o lojista responde achando que a pergunta é de
 * agora quando é de terça passada.
 */
function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
      {(["cliente", "voce", "equipe", "ia"] as Autoria[]).map((a) => (
        <span key={a} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${ESTILO_PONTO[a]}`} aria-hidden="true" />
          {NOME_AUTORIA[a]}
        </span>
      ))}
    </div>
  );
}

export function JanelaConversa({
  conversa,
  mensagens,
  carregando,
  enviando,
  meuUserId,
  onEnviar,
  onMudarStatus,
  onPausarIa,
  onCorrigirNome,
  pedido,
  onCancelarPedido,
  ampliado = false,
  onAmpliar,
}: {
  conversa: ConversaCrm | null;
  mensagens: MensagemCrm[];
  carregando: boolean;
  enviando: boolean;
  meuUserId: string | null;
  onEnviar: (texto: string, arquivo?: ArquivoParaEnviar | null) => Promise<void>;
  onMudarStatus: (status: "open" | "pending" | "closed") => void;
  /** Liga (`true`) ou desliga (`false`) a trava da IA nesta conversa. */
  onPausarIa: (pausar: boolean) => void;
  onCorrigirNome: () => void;
  pedido: PedidoDoChat | null;
  onCancelarPedido: () => Promise<void>;
  /** Tela cheia: some a lista da esquerda e o painel em volta. */
  ampliado?: boolean;
  onAmpliar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<ArquivoParaEnviar | null>(null);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement | null>(null);
  const fim = useRef<HTMLDivElement | null>(null);

  // Cada mensagem já sai daqui sabendo quem falou, se precisa de faixa de dia
  // e se é continuação da anterior — a tela só desenha.
  const linhas = useMemo(() => {
    let diaAnterior = "";
    let autorAnterior: Autoria | null = null;
    return mensagens.map((m) => {
      const autor = quemFalou(m, meuUserId);
      const dia = diaDaMensagem(m.created_at);
      const abreDia = dia !== diaAnterior;
      // Quatro mensagens seguidas da mesma pessoa não precisam de quatro
      // avatares e quatro nomes repetidos: vira poluição.
      const continuacao = !abreDia && autor === autorAnterior;
      diaAnterior = dia;
      autorAnterior = autor;
      return { m, autor, dia, abreDia, continuacao };
    });
  }, [mensagens, meuUserId]);

  // Toda conversa abre no fim, onde está o que acabou de chegar — e não no
  // começo, de meses atrás.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, conversa?.id]);

  if (!conversa) {
    return (
      <div className="grid h-full place-items-center bg-muted/40 p-8 text-center">
        <div className="max-w-xs">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card shadow-sm">
            <Bot className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">Nenhuma conversa aberta</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha alguém na lista ao lado para ver o histórico e responder.
          </p>
        </div>
      </div>
    );
  }

  const nome = conversa.contato?.name?.trim();
  const telefone = conversa.contato?.phone_e164 ?? "";
  const titulo = nome || formatPhoneForDisplay(telefone) || "Sem nome";
  const foto = conversa.contato?.avatar_url ?? null;
  const pedidos = conversa.contato?.orders_count ?? 0;
  const gasto = conversa.contato?.total_spent_cents ?? 0;
  // Dinheiro é guardado em centavos inteiros; a divisão acontece só aqui, na
  // hora de mostrar.
  const gasto_formatado = (gasto / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // A trava da IA: um humano assumiu, a IA fica quieta até esta hora.
  const iaPausada = iaEstaPausada(conversa.ia_pausada_ate);
  const pausadaAte = iaPausada
    ? new Date(conversa.ia_pausada_ate as string).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  async function enviar() {
    const limpo = texto.trim();
    // Com arquivo, o texto vira legenda e pode ficar vazio: mandar uma foto
    // sem escrever nada é o normal no WhatsApp.
    if ((!limpo && !anexo) || enviando) return;
    const guardado = anexo;
    // A caixa esvazia antes da confirmação: se der erro, o texto volta. Deixar
    // a frase presa na caixa enquanto o envio acontece faz a pessoa apertar
    // enviar de novo e mandar duas vezes.
    setTexto("");
    setAnexo(null);
    try {
      await onEnviar(limpo, guardado);
    } catch {
      setTexto(limpo);
      setAnexo(guardado);
    }
  }

  /**
   * O ARQUIVO É CONFERIDO AQUI, ANTES DE SAIR DAQUI.
   *
   * O WhatsApp recusa arquivo grande, e a recusa dele chega depois — com o
   * lojista já achando que mandou. Dizer não agora é dizer não enquanto ele
   * ainda está olhando a tela.
   */
  function aoEscolherArquivo(arquivo: File | null | undefined) {
    if (!arquivo) return;
    const conferido = conferirArquivo(arquivo.type, arquivo.size);
    if (!conferido.ok) {
      setErroAnexo(conferido.motivo);
      return;
    }
    setErroAnexo(null);
    void lerArquivoComoBase64(arquivo)
      .then(setAnexo)
      .catch((e: unknown) =>
        setErroAnexo(e instanceof Error ? e.message : "Não consegui ler o arquivo."),
      );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ------- CABEÇALHO: colado em cima, nunca rola ------- */}
      <div className="shrink-0 border-b-2 border-border bg-card px-3 py-2.5 shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {foto ? (
              <img
                src={foto}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-muted text-sm font-bold text-foreground ${
                foto ? "hidden" : ""
              }`}
              aria-hidden="true"
            >
              {titulo.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              {/* O nome é um botão. O WhatsApp nem sempre manda o nome certo, e
                  quem percebe o erro está olhando exatamente para ele — ter de
                  caçar a correção em outra tela é o que faz ninguém corrigir. */}
              <button
                type="button"
                onClick={onCorrigirNome}
                className="group flex min-w-0 items-center gap-1.5 text-left"
                title="Corrigir o nome deste cliente"
              >
                <span className="truncate text-sm font-bold leading-tight text-foreground group-hover:underline">
                  {titulo}
                </span>
                <Pencil
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                  aria-hidden="true"
                />
              </button>
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground">
                <span className="truncate">{formatPhoneForDisplay(telefone)}</span>
                {/* A ficha é a mesma do Marketing: atender sabendo que do outro
                    lado está quem já comprou 14 vezes é diferente de atender às
                    cegas. */}
                {pedidos > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                    {pedidos === 1 ? "1 pedido" : `${pedidos} pedidos`}
                    {gasto > 0 && (
                      <span className="text-muted-foreground">· {gasto_formatado}</span>
                    )}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* A TRAVA DA IA, À VISTA. Responder pelo painel já liga sozinho;
                o botão serve para assumir antes de escrever, ou para devolver
                a conversa à IA sem esperar a trava vencer. */}
            <Button
              type="button"
              variant={iaPausada ? "default" : "outline"}
              size="sm"
              onClick={() => onPausarIa(!iaPausada)}
              className="h-9 shrink-0 gap-1.5 border-2 px-2.5 text-xs font-semibold"
              title={
                iaPausada
                  ? `A IA está quieta até ${pausadaAte}. Clique para devolver a conversa à IA.`
                  : "Assumir a conversa: a IA para de responder este cliente."
              }
            >
              {iaPausada ? (
                <>
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  <span>Devolver à IA</span>
                  <span className="hidden font-normal opacity-80 sm:inline">
                    (pausada até {pausadaAte})
                  </span>
                </>
              ) : (
                <>
                  <Hand className="h-4 w-4" aria-hidden="true" />
                  <span>Pausar IA</span>
                </>
              )}
            </Button>
            {/* AMPLIAR: a conversa toma a tela inteira.
                Numa tela de notebook, a coluna da conversa fica com menos de
                metade da largura e uma mensagem de cinco linhas vira quinze. É
                o mesmo gesto de encostar a comanda no olho para ler a letra
                miúda — só que aqui a letra é que cresce. */}
            {onAmpliar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAmpliar}
                className="h-9 w-9 shrink-0 border-2 p-0"
                aria-label={ampliado ? "Voltar ao tamanho normal" : "Ampliar a conversa"}
                title={ampliado ? "Voltar ao tamanho normal" : "Ampliar a conversa"}
              >
                {ampliado ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            )}
            <Select
              value={conversa.status}
              onValueChange={(v) => onMudarStatus(v as "open" | "pending" | "closed")}
            >
              <SelectTrigger
                className="h-9 w-full border-2 text-xs font-semibold sm:w-[190px]"
                aria-label="Situação da conversa"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTULO_STATUS_CONVERSA.map((s) => (
                  <SelectItem key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Legenda />
        </div>
      </div>

      {/* ------- MENSAGENS: a ÚNICA parte que rola ------- */}
      <div className="fundo-conversa min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
        {carregando && mensagens.length === 0 && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}

        {!carregando && mensagens.length === 0 && (
          <p className="py-10 text-center text-sm font-medium text-muted-foreground">
            Nenhuma mensagem nesta conversa ainda.
          </p>
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {linhas.map(({ m, autor, dia, abreDia, continuacao }) => {
            const direita = ladoDireito(autor);
            return (
              <div key={m.id}>
                {abreDia && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground shadow-sm">
                      {dia}
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                )}

                <div
                  className={`flex items-end gap-2 ${direita ? "flex-row-reverse" : "flex-row"} ${
                    continuacao ? "mt-0.5" : "mt-2.5"
                  }`}
                >
                  {/* O avatar só aparece na primeira de uma sequência; nas
                      seguintes fica um vão do mesmo tamanho, para os balões
                      continuarem alinhados. */}
                  {continuacao ? (
                    <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                  ) : (
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold shadow-sm ${ESTILO_AVATAR[autor]}`}
                      aria-hidden="true"
                    >
                      {autor === "ia" ? <Bot className="h-4 w-4" /> : INICIAL_AUTORIA[autor]}
                    </span>
                  )}

                  <div className={`min-w-0 max-w-[82%] sm:max-w-[68%]`}>
                    {!continuacao && (
                      <p
                        className={`mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ${
                          direita ? "justify-end" : "justify-start"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${ESTILO_PONTO[autor]}`}
                          aria-hidden="true"
                        />
                        {NOME_AUTORIA[autor]}
                      </p>
                    )}

                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-md ${ESTILO_BALAO[autor]} ${
                        direita ? "rounded-br-md" : "rounded-bl-md"
                      }`}
                    >
                      {m.body && (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                      )}
                      {/* O ARQUIVO VEM ANTES DO TEXTO, como no WhatsApp: a foto
                          em cima, a legenda embaixo. */}
                      {m.media_url ? (
                        <BalaoMidia
                          url={m.media_url}
                          tipo={m.media_type}
                          claro={autor !== "cliente"}
                        />
                      ) : (
                        // Chegou arquivo mas o endereço ainda não veio (o fluxo
                        // está baixando). Dizer "Áudio" é melhor que um balão
                        // em branco, que foi justamente o defeito relatado.
                        ehTipoMidia(m.media_type) && (
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold italic opacity-90">
                            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                            {ROTULO_MIDIA[m.media_type]}
                          </p>
                        )
                      )}
                      <div
                        className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] font-medium ${
                          autor === "cliente" ? "text-muted-foreground" : "text-white/85"
                        }`}
                      >
                        <span>{horario(m.created_at)}</span>
                        {direita && <MarcaDeEnvio status={m.status} erro={m.error_message} />}
                      </div>
                    </div>

                    {m.status === "failed" && m.error_message && (
                      <p
                        className={`mt-1 text-[11px] font-semibold text-destructive ${
                          direita ? "text-right" : "text-left"
                        }`}
                      >
                        {m.error_message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={fim} />
      </div>

      {pedido && <CartaoPedido pedido={pedido} onCancelar={onCancelarPedido} />}

      {/* ------- CAIXA DE ESCREVER: colada embaixo, nunca rola ------- */}
      <div className="shrink-0 border-t-2 border-border bg-card p-3">
        {/* O QUE ESTÁ PRESO NA MENSAGEM, antes de ela sair. Ver o nome e o
            tamanho do arquivo evita o clássico "mandei a foto errada". */}
        {anexo && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border-2 border-border bg-muted/50 px-3 py-2">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">{anexo.nome}</p>
              <p className="text-[11px] font-medium text-muted-foreground">
                {tamanhoLegivel(anexo.tamanho)} · vai junto com o que você escrever
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAnexo(null)}
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Tirar o arquivo"
              title="Tirar o arquivo"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {erroAnexo && (
          <p className="mx-auto mb-2 max-w-3xl text-xs font-semibold text-destructive">
            {erroAnexo}
          </p>
        )}

        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <input
            ref={seletor}
            type="file"
            className="hidden"
            accept="image/*,audio/*,video/*,application/pdf"
            onChange={(e) => {
              aoEscolherArquivo(e.target.files?.[0]);
              // Zerar permite escolher DE NOVO o mesmo arquivo depois de tirá-lo.
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => seletor.current?.click()}
            disabled={enviando}
            className="h-11 w-11 shrink-0 rounded-xl border-2 p-0"
            aria-label="Mandar uma foto ou arquivo"
            title="Mandar uma foto ou arquivo"
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </Button>

          <GravadorDeAudio
            desabilitado={enviando}
            onPronto={(a) => {
              setErroAnexo(null);
              setAnexo(a);
            }}
            onErro={setErroAnexo}
          />

          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envia, Shift+Enter pula linha — o mesmo hábito do WhatsApp.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={anexo ? "Escreva uma legenda (opcional)..." : "Escreva a resposta..."}
            rows={1}
            className="max-h-32 min-h-[44px] resize-none rounded-xl border-2 bg-background text-sm"
            aria-label="Mensagem"
          />
          <Button
            onClick={() => void enviar()}
            disabled={enviando || (!texto.trim() && !anexo)}
            className="h-11 w-11 shrink-0 rounded-xl p-0 shadow-md"
            aria-label="Enviar mensagem"
          >
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

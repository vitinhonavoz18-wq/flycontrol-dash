import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Check, CheckCheck, AlertTriangle, Clock } from "lucide-react";
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
import type { ConversaCrm, MensagemCrm } from "@/lib/crm/crm.functions";

/**
 * A coluna da direita: a conversa aberta.
 *
 * O QUE CADA MARQUINHA QUER DIZER (o lojista precisa entender sem manual)
 *
 *   relógio  — está na fila, ainda não saiu
 *   ✓        — o WhatsApp pegou para entregar
 *   ✓✓       — entregue
 *   triângulo — não deu certo; o motivo aparece ao lado
 *
 * Sem isso, uma mensagem que falhou fica visualmente igual a uma entregue, e
 * o lojista só descobre o problema quando o cliente reclama que nunca
 * respondeu.
 */

const ROTULO_STATUS_CONVERSA = [
  { valor: "open", rotulo: "Aberta" },
  { valor: "pending", rotulo: "Aguardando cliente" },
  { valor: "closed", rotulo: "Resolvida" },
];

function MarcaDeEnvio({ status, erro }: { status: string; erro: string | null }) {
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-destructive" title={erro ?? "Falha no envio"}>
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        não enviada
      </span>
    );
  }
  if (status === "sent") return <CheckCheck className="h-3 w-3" aria-label="entregue" />;
  if (status === "sending") return <Check className="h-3 w-3" aria-label="saindo" />;
  return <Clock className="h-3 w-3" aria-label="na fila" />;
}

function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function JanelaConversa({
  conversa,
  mensagens,
  carregando,
  enviando,
  onEnviar,
  onMudarStatus,
}: {
  conversa: ConversaCrm | null;
  mensagens: MensagemCrm[];
  carregando: boolean;
  enviando: boolean;
  onEnviar: (texto: string) => Promise<void>;
  onMudarStatus: (status: "open" | "pending" | "closed") => void;
}) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement | null>(null);

  // Toda conversa abre no fim, onde está o que acabou de chegar — e não no
  // começo, de meses atrás.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, conversa?.id]);

  if (!conversa) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        Escolha uma conversa à esquerda para começar.
      </div>
    );
  }

  const nome = conversa.contato?.name?.trim();
  const telefone = conversa.contato?.phone_e164 ?? "";

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    // A caixa esvazia antes da confirmação: se der erro, o texto volta. Deixar
    // a frase presa na caixa enquanto o envio acontece faz a pessoa apertar
    // enviar de novo e mandar duas vezes.
    setTexto("");
    try {
      await onEnviar(limpo);
    } catch {
      setTexto(limpo);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {nome || formatPhoneForDisplay(telefone) || "Sem nome"}
          </p>
          {nome && (
            <p className="truncate text-xs text-muted-foreground">
              {formatPhoneForDisplay(telefone)}
            </p>
          )}
        </div>
        <Select
          value={conversa.status}
          onValueChange={(v) => onMudarStatus(v as "open" | "pending" | "closed")}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Situação da conversa">
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

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {carregando && mensagens.length === 0 && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}

        {!carregando && mensagens.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma mensagem nesta conversa ainda.
          </p>
        )}

        {mensagens.map((m) => {
          const minha = m.direction === "out";
          return (
            <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${
                  minha
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border"
                }`}
              >
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.media_url && <p className="text-xs italic opacity-80">[arquivo recebido]</p>}
                <div
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    minha ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  <span>{horario(m.created_at)}</span>
                  {minha && <MarcaDeEnvio status={m.status} erro={m.error_message} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
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
          placeholder="Escreva a resposta..."
          rows={2}
          className="min-h-[44px] resize-none"
          aria-label="Mensagem"
        />
        <Button
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          className="h-11 shrink-0"
          aria-label="Enviar mensagem"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

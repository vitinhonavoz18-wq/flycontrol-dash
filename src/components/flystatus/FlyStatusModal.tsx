import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Hash, ImageOff, Loader2, Phone, Send, X } from "lucide-react";
import { toast } from "sonner";
import { enviarAtualizacaoDeStatus } from "@/lib/flystatus/flystatus.functions";
import {
  FLYSTATUS_META,
  montarMensagem,
  normalizarTelefone,
  pickArt,
  type FlyStatusKind,
  type FlyStatusPizzeria,
} from "@/lib/flystatus/mensagem";

// A arte, o texto e a lista de etapas moram em `lib/flystatus/mensagem.ts`,
// porque o servidor também precisa deles para montar a mensagem que sai. Estes
// repasses existem para as telas que já importavam daqui continuarem valendo.
export {
  FLYSTATUS_META,
  getFlyStatusKind,
  pickArt,
  type FlyStatusKind,
  type FlyStatusPizzeria,
} from "@/lib/flystatus/mensagem";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FlyStatusKind | null;
  orderId: string;
  orderNumber: number | string;
  customerName: string;
  customerPhone: string;
  pizzeria: FlyStatusPizzeria | null;
};

type Situacao =
  | { estado: "parado" }
  | { estado: "enviando" }
  | { estado: "enviado" }
  | { estado: "erro"; mensagem: string }
  /** Não há WhatsApp conectado: o dono envia à mão, e a arte não vai junto. */
  | { estado: "manual"; texto: string; telefone: string };

/**
 * O aviso que vai para o cliente quando o pedido muda de etapa.
 *
 * O QUE MUDOU AQUI, E POR QUÊ
 *
 * Antes, este popup montava um endereço `wa.me` com a mensagem E O ENDEREÇO DA
 * ARTE dentro do texto, e abria o WhatsApp. Só que `wa.me` só carrega texto:
 * o cliente recebia o link da imagem, não a imagem. Era como mandar o cardápio
 * dizendo "a foto da pizza está na gaveta" em vez de mandar a foto.
 *
 * Agora o envio é feito pelo servidor, que busca a arte e a manda como
 * IMAGEM de verdade, com a mensagem como legenda. O navegador só informa qual
 * pedido e qual etapa — telefone, arte e WhatsApp saem do próprio pedido.
 */
export function FlyStatusModal({
  open,
  onOpenChange,
  kind,
  orderId,
  orderNumber,
  customerName,
  customerPhone,
  pizzeria,
}: Props) {
  const enviar = useServerFn(enviarAtualizacaoDeStatus);
  const [situacao, setSituacao] = useState<Situacao>({ estado: "parado" });
  // Trava de verdade contra clique duplo: o estado do React pode ainda não ter
  // sido aplicado quando o segundo clique chega, e aí sairiam duas mensagens.
  const enviando = useRef(false);

  useEffect(() => {
    if (!open) {
      setSituacao({ estado: "parado" });
      enviando.current = false;
    }
  }, [open]);

  if (!kind) return null;
  const meta = FLYSTATUS_META[kind];
  const { url } = pickArt(pizzeria, kind);
  const { texto: message } = montarMensagem(pizzeria, kind, orderNumber, customerName);
  const temTelefone = !!normalizarTelefone(customerPhone);

  async function enviarAoCliente() {
    if (enviando.current) return;
    enviando.current = true;
    setSituacao({ estado: "enviando" });

    try {
      const r = await enviar({ data: { orderId, kind: kind! } });

      if (r.ok) {
        setSituacao({ estado: "enviado" });
        toast.success("Atualização enviada ao cliente.");
        // Some sozinho depois de a pessoa ver a confirmação.
        setTimeout(() => onOpenChange(false), 1200);
        return;
      }

      if (r.motivo === "whatsapp_nao_configurado") {
        setSituacao({ estado: "manual", texto: r.texto, telefone: r.telefone });
        return;
      }

      setSituacao({ estado: "erro", mensagem: r.mensagem });
    } catch (e) {
      setSituacao({
        estado: "erro",
        mensagem: e instanceof Error ? e.message : "Não foi possível enviar a atualização.",
      });
    } finally {
      enviando.current = false;
    }
  }

  function abrirWhatsAppManual(texto: string, telefone: string) {
    // Só o texto. A arte NÃO entra aqui: colar o endereço dela é exatamente o
    // bug que fazia o cliente receber um link no lugar da imagem.
    const alvo = `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
    window.open(alvo, "_blank", "noopener,noreferrer");
  }

  const ocupado = situacao.estado === "enviando";

  return (
    <Dialog open={open} onOpenChange={(o) => !ocupado && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-[680px] flex-col overflow-hidden p-0 lg:max-w-[820px]">
        <div className={`bg-gradient-to-b ${meta.accent} shrink-0 px-6 pb-3 pt-5`}>
          <DialogHeader>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              FlyStatus
            </div>
            <DialogTitle className="text-xl font-black">
              <span className="mr-2">{meta.emoji}</span>
              {meta.title}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Pedido <span className="font-semibold text-foreground">#{orderNumber}</span> ·{" "}
              {customerName}
            </p>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-border bg-card p-2">
              <div className="mb-0.5 flex items-center gap-1 text-muted-foreground">
                <Hash className="h-3 w-3" /> Pedido
              </div>
              <div className="font-bold text-foreground">#{orderNumber}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2">
              <div className="mb-0.5 flex items-center gap-1 text-muted-foreground">
                <Phone className="h-3 w-3" /> Telefone
              </div>
              <div className="truncate font-bold text-foreground">
                {customerPhone || "Não informado"}
              </div>
            </div>
          </div>

          <div className="relative h-[220px] overflow-hidden rounded-xl border border-border bg-muted/30 duration-300 animate-in fade-in zoom-in-95 md:h-[300px]">
            {url ? (
              <img
                src={url}
                alt={meta.title}
                className="h-full w-full bg-black/20 object-contain"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                <ImageOff className="h-8 w-8 opacity-50" />
                <div className="text-sm font-medium">Nenhuma arte configurada</div>
                <div className="text-xs">
                  Vá em Configurações → Artes de Status para enviar a imagem.
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-xs leading-relaxed">
            {message || (
              <span className="italic text-muted-foreground">Sem mensagem configurada.</span>
            )}
          </div>

          {/* Erro não fecha o popup: quem tentou enviar precisa ler o motivo e
              poder tentar de novo sem refazer o caminho todo. */}
          {situacao.estado === "erro" && (
            <div className="mt-3 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">
                  Não foi possível enviar a atualização ao cliente.
                </p>
                <p className="mt-0.5 text-muted-foreground">{situacao.mensagem}</p>
              </div>
            </div>
          )}

          {situacao.estado === "manual" && (
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div>
                <p className="font-semibold text-foreground">
                  O envio automático ainda não está ligado nesta conta.
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Dá para abrir a conversa com o texto pronto e enviar à mão — mas{" "}
                  <strong className="text-foreground">a arte não vai junto</strong>. O WhatsApp só
                  aceita imagem quando o envio é automático. Para ligar, conecte o WhatsApp em
                  Marketing → Configurações.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" /> Fechar
          </Button>

          {situacao.estado === "manual" ? (
            <Button
              size="sm"
              onClick={() => abrirWhatsAppManual(situacao.texto, situacao.telefone)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" /> Abrir conversa (só texto)
            </Button>
          ) : (
            <Button
              disabled={!temTelefone || ocupado || situacao.estado === "enviado"}
              onClick={enviarAoCliente}
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {situacao.estado === "enviando" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              {situacao.estado === "enviado" && (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {situacao.estado === "parado" && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              {situacao.estado === "erro" && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              {situacao.estado === "enviando"
                ? "Enviando…"
                : situacao.estado === "enviado"
                  ? "Atualização enviada"
                  : situacao.estado === "erro"
                    ? "Tentar de novo"
                    : "Enviar ao Cliente"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

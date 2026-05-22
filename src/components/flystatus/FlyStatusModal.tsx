import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, X, ImageOff, Phone, Hash, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export type FlyStatusKind = "preparando" | "saiu" | "entregue";

export const FLYSTATUS_META: Record<
  FlyStatusKind,
  { title: string; emoji: string; accent: string }
> = {
  preparando: { title: "Em Preparo", emoji: "🍕🔥", accent: "from-blue-500/20 to-blue-500/0" },
  saiu: { title: "Saiu para Entrega", emoji: "🛵💨", accent: "from-amber-500/20 to-amber-500/0" },
  entregue: {
    title: "Pedido Entregue",
    emoji: "🍕❤️",
    accent: "from-emerald-500/20 to-emerald-500/0",
  },
};

export function getFlyStatusKind(status: string): FlyStatusKind | null {
  if (status === "preparando") return "preparando";
  if (status === "saiu") return "saiu";
  if (status === "entregue") return "entregue";
  return null;
}

export type FlyStatusPizzeria = {
  status_art_preparando_url?: string | null;
  status_art_saiu_url?: string | null;
  status_art_entregue_url?: string | null;
  status_text_preparando?: string | null;
  status_text_saiu?: string | null;
  status_text_entregue?: string | null;
};

export function pickArt(pz: FlyStatusPizzeria | null | undefined, kind: FlyStatusKind) {
  if (!pz) return { url: "", text: "" };
  if (kind === "preparando")
    return { url: pz.status_art_preparando_url ?? "", text: pz.status_text_preparando ?? "" };
  if (kind === "saiu")
    return { url: pz.status_art_saiu_url ?? "", text: pz.status_text_saiu ?? "" };
  return { url: pz.status_art_entregue_url ?? "", text: pz.status_text_entregue ?? "" };
}

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FlyStatusKind | null;
  orderNumber: number | string;
  customerName: string;
  customerPhone: string;
  pizzeria: FlyStatusPizzeria | null;
};

export function FlyStatusModal({
  open,
  onOpenChange,
  kind,
  orderNumber,
  customerName,
  customerPhone,
  pizzeria,
}: Props) {
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!open) setSending(false);
  }, [open]);

  if (!kind) return null;
  const meta = FLYSTATUS_META[kind];
  const { url, text } = pickArt(pizzeria, kind);
  const baseMessage = text || "Seu pedido foi atualizado 😋🍕\n\nPedido #{NUMERO}";
  const message = baseMessage
    .replace(/\{NUMERO\}/g, String(orderNumber))
    .replace(/#NUMERO/g, `#${orderNumber}`);
  const phone = normalizePhone(customerPhone);
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message + (url ? `\n\n${url}` : ""))}`
    : "";

  function sendToCustomer() {
    if (!phone) {
      toast.error("Telefone do cliente inválido");
      return;
    }
    setSending(true);
    window.open(waUrl, "_blank", "noopener,noreferrer");
    if (url) toast.info("A arte foi incluída como link para compartilhamento no WhatsApp.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] lg:max-w-[820px] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <div className={`bg-gradient-to-b ${meta.accent} px-6 pt-5 pb-3 shrink-0`}>
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

        <div className="px-6 py-2 overflow-y-auto flex-1">
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
          
          <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30 h-[220px] md:h-[300px] animate-in fade-in zoom-in-95 duration-300">
            {url ? (
              <img src={url} alt={meta.title} className="h-full w-full object-contain bg-black/20" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted-foreground p-6">
                <ImageOff className="h-8 w-8 opacity-50" />
                <div className="text-sm font-medium">Nenhuma arte configurada</div>
                <div className="text-xs">
                  Vá em Configurações → Artes de Status para enviar a imagem.
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs whitespace-pre-wrap leading-relaxed">
            {message || (
              <span className="text-muted-foreground italic">Sem mensagem configurada.</span>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end border-t border-border bg-card shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" /> Fechar
          </Button>
          {url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="hidden sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir arte
            </Button>
          )}
          <Button
            disabled={!phone}
            onClick={sendToCustomer}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="h-3.5 w-3.5" /> {sending ? "WhatsApp aberto" : "Enviar ao Cliente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

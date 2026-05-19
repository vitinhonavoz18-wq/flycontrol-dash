import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, Copy, Check, ImageOff } from "lucide-react";
import { toast } from "sonner";

export type FlyStatusKind = "preparando" | "saiu" | "entregue";

export const FLYSTATUS_META: Record<FlyStatusKind, { title: string; emoji: string; accent: string }> = {
  preparando: { title: "Em Preparo", emoji: "🍕🔥", accent: "from-blue-500/20 to-blue-500/0" },
  saiu: { title: "Saiu para Entrega", emoji: "🛵💨", accent: "from-amber-500/20 to-amber-500/0" },
  entregue: { title: "Pedido Entregue", emoji: "🍕❤️", accent: "from-emerald-500/20 to-emerald-500/0" },
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
  if (kind === "preparando") return { url: pz.status_art_preparando_url ?? "", text: pz.status_text_preparando ?? "" };
  if (kind === "saiu") return { url: pz.status_art_saiu_url ?? "", text: pz.status_text_saiu ?? "" };
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

export function FlyStatusModal({ open, onOpenChange, kind, orderNumber, customerName, customerPhone, pizzeria }: Props) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!open) setCopied(false); }, [open]);

  if (!kind) return null;
  const meta = FLYSTATUS_META[kind];
  const { url, text } = pickArt(pizzeria, kind);
  const message = (text || "").replace(/\{NUMERO\}/g, String(orderNumber)).replace(/#NUMERO/g, `#${orderNumber}`);
  const phone = normalizePhone(customerPhone);
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message + (url ? `\n\n${url}` : ""))}`
    : "";

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message + (url ? `\n\n${url}` : ""));
      setCopied(true);
      toast.success("Mensagem copiada");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className={`bg-gradient-to-b ${meta.accent} px-6 pt-6 pb-4`}>
          <DialogHeader>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">FlyStatus</div>
            <DialogTitle className="text-2xl font-black">
              <span className="mr-2">{meta.emoji}</span>{meta.title}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Pedido <span className="font-semibold text-foreground">#{orderNumber}</span> · {customerName}
            </p>
          </DialogHeader>
        </div>

        <div className="px-6">
          <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30 aspect-square animate-in fade-in zoom-in-95 duration-300">
            {url ? (
              <img src={url} alt={meta.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted-foreground p-6">
                <ImageOff className="h-10 w-10 opacity-50" />
                <div className="text-sm font-medium">Nenhuma arte configurada</div>
                <div className="text-xs">Vá em Configurações → Artes de Status para enviar a imagem.</div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card p-3 text-sm whitespace-pre-wrap leading-relaxed">
            {message || <span className="text-muted-foreground italic">Sem mensagem configurada.</span>}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={copyMessage}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar mensagem"}
          </Button>
          <Button
            disabled={!phone}
            onClick={() => {
              if (!phone) { toast.error("Telefone do cliente inválido"); return; }
              window.open(waUrl, "_blank", "noopener,noreferrer");
            }}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" /> Enviar ao Cliente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

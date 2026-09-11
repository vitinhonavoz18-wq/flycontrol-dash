import { Loader2, Search, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import type { ConversaCrm } from "@/lib/crm/crm.functions";

/**
 * A coluna da esquerda: quem falou com o restaurante.
 *
 * A ordem é a que a pessoa espera — quem falou por último aparece primeiro,
 * igual ao próprio WhatsApp. A bolinha laranja marca o que ainda não foi
 * lido; sem ela, a conversa nova se perde no meio das antigas.
 */

const ROTULO_STATUS: Record<string, string> = {
  open: "Aberta",
  pending: "Aguardando cliente",
  closed: "Resolvida",
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `${dias} dias`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ListaConversas({
  conversas,
  carregando,
  selecionada,
  busca,
  onBusca,
  onSelecionar,
  onNova,
}: {
  conversas: ConversaCrm[];
  carregando: boolean;
  selecionada: string | null;
  busca: string;
  onBusca: (v: string) => void;
  onSelecionar: (id: string) => void;
  onNova: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="h-9 pl-8"
            aria-label="Buscar conversa"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          onClick={onNova}
          title="Nova conversa"
          aria-label="Nova conversa"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {carregando && conversas.length === 0 && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}

        {!carregando && conversas.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa ainda. Quando um cliente mandar mensagem no WhatsApp da loja, ela
            aparece aqui.
          </p>
        )}

        {conversas.map((c) => {
          const nome = c.contato?.name?.trim();
          const telefone = c.contato?.phone_e164 ?? "";
          const ativa = c.id === selecionada;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelecionar(c.id)}
              aria-current={ativa ? "true" : undefined}
              className={`flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors ${
                ativa ? "bg-primary/10" : "hover:bg-muted/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {nome || formatPhoneForDisplay(telefone) || "Sem nome"}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {quando(c.last_message_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {c.last_message_preview || ROTULO_STATUS[c.status] || ""}
                </span>
                {c.unread_count > 0 && (
                  <span
                    className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                    aria-label={`${c.unread_count} não lidas`}
                  >
                    {c.unread_count > 99 ? "99+" : c.unread_count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

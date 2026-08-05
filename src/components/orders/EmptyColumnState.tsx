import { Inbox } from "lucide-react";

/**
 * Estado vazio de uma coluna. Continua ocupando altura para que a coluna siga
 * sendo um alvo válido de soltura mesmo sem nenhum card.
 */
export function EmptyColumnState({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
      <div className="space-y-2">
        <Inbox className="mx-auto h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/70">Arraste um pedido para cá</p>
      </div>
    </div>
  );
}

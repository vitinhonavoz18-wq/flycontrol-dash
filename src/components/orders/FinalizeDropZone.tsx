import { useDroppable } from "@dnd-kit/core";
import { CheckCircle2 } from "lucide-react";

export type FinalizeDropZoneProps = {
  /** Só existe enquanto um card está sendo arrastado. */
  visible: boolean;
};

/**
 * Alvo de soltar que finaliza o pedido — some da mesa "Novo pedido / Em
 * preparo / Saiu para entrega" e passa a existir só no histórico.
 *
 * Só aparece durante o arraste (como um FAB flutuante), do mesmo jeito que um
 * "arquivar" em apps de quadro: não ocupa espaço na tela parada, mas fica
 * óbvio para onde soltar quando o card já está na mão.
 */
export function FinalizeDropZone({ visible }: FinalizeDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "entregue" });

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[var(--z-overlay)] flex justify-center px-4 duration-150 animate-in fade-in slide-in-from-bottom-2 md:bottom-6"
      aria-hidden={false}
    >
      <div
        ref={setNodeRef}
        role="button"
        aria-label="Finalizar pedido: soltar aqui envia o pedido para o histórico"
        className={`pointer-events-auto flex items-center gap-2 rounded-full border-2 border-dashed px-6 py-3 text-sm font-bold shadow-lg transition-all ${
          isOver
            ? "scale-105 border-emerald-500 bg-emerald-500 text-white"
            : "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        }`}
      >
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        Finalizar pedido
      </div>
    </div>
  );
}

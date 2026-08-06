import { AlertTriangle, Clock } from "lucide-react";
import {
  DELAY_THRESHOLD_MINUTES,
  formatElapsed,
  getDelayLevel,
  type DelayLevel,
} from "./orderStatusConfig";

const LEVEL_STYLES: Record<DelayLevel, string> = {
  normal: "text-muted-foreground",
  attention: "text-amber-600 dark:text-amber-400 font-semibold",
  late: "text-rose-600 dark:text-rose-400 font-bold",
};

const LEVEL_TEXT: Record<DelayLevel, string> = {
  normal: "",
  attention: `atenção: mais de ${DELAY_THRESHOLD_MINUTES.attention} minutos`,
  late: `atrasado: mais de ${DELAY_THRESHOLD_MINUTES.late} minutos`,
};

/**
 * Tempo decorrido desde a criação do pedido.
 *
 * Não tem timer próprio: recebe `now` de um único intervalo no topo do quadro,
 * para não criar um temporizador por card.
 */
export function OrderTimer({ createdAt, now }: { createdAt: string; now: number }) {
  const level = getDelayLevel(createdAt, now);
  const elapsed = formatElapsed(createdAt, now);
  const suffix = LEVEL_TEXT[level];

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${LEVEL_STYLES[level]}`}>
      {level === "normal" ? (
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      {/* O texto entre parênteses não aparece na tela, mas é lido em voz alta:
          o atraso não pode depender só da cor do ícone. */}
      <span>
        {elapsed}
        {suffix && <span className="sr-only"> ({suffix})</span>}
      </span>
    </span>
  );
}

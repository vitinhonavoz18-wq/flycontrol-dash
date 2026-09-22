import { Check, Circle, Clock, Loader2 } from "lucide-react";
import { ETAPAS_DO_GUIA, type IdDaEtapaDoGuia } from "@/lib/onboarding/guia/etapas";

export type ProgressoDoGuiaProps = {
  concluidas: readonly IdDaEtapaDoGuia[];
  etapaAtual: IdDaEtapaDoGuia | null;
  progresso: number;
};

/**
 * "Configuração da sua loja — 35%", com a lista de etapas.
 *
 * POR QUE MOSTRAR O CAMINHO INTEIRO, INCLUSIVE O QUE AINDA NÃO DÁ PARA FAZER
 *
 * Quem não vê o fim não sabe se falta um minuto ou uma tarde, e desiste no
 * meio. A lista inteira responde "quanto falta" antes de a pessoa precisar
 * perguntar.
 *
 * As etapas marcadas "em breve" aparecem apagadas e com relógio: elas fazem
 * parte do plano mas o guia ainda não conduz até lá. Escondê-las faria o
 * lojista terminar o guia achando que a loja está 100% pronta quando ainda
 * falta pagamento e WhatsApp — é o boletim sem as matérias que ninguém deu.
 *
 * A PORCENTAGEM É DAS ETAPAS DE VERDADE
 *
 * Ela conta só o que o guia conduz hoje, e cada uma dessas só fecha quando o
 * banco confirma. Nenhuma se marca por clique.
 */
export function ProgressoDoGuia({ concluidas, etapaAtual, progresso }: ProgressoDoGuiaProps) {
  const feitas = new Set(concluidas);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Configuração da sua loja
        </span>
        <span className="text-sm font-black tabular-nums text-primary">{progresso}%</span>
      </div>

      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progresso}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da configuração da sua loja"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progresso}%` }}
        />
      </div>

      {/* Rola por dentro: com nove etapas numa tela de 390px, a lista sozinha
          empurraria o botão de continuar para fora da tela. */}
      <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs sm:max-h-52">
        {ETAPAS_DO_GUIA.map((etapa) => {
          const feita = feitas.has(etapa.id);
          const agora = etapa.id === etapaAtual;

          return (
            <li
              key={etapa.id}
              className={`flex items-center gap-2 ${
                feita
                  ? "text-emerald-600 dark:text-emerald-400"
                  : agora
                    ? "font-bold text-foreground"
                    : etapa.emBreve
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground"
              }`}
            >
              {feita ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : agora ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : etapa.emBreve ? (
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{etapa.rotulo}</span>
              {/* O estado também vai em texto: quem usa leitor de tela não vê
                  ícone, e quem não distingue verde não vê a cor. */}
              <span className="sr-only">
                {feita
                  ? "concluída"
                  : agora
                    ? "etapa atual"
                    : etapa.emBreve
                      ? "em breve"
                      : "pendente"}
              </span>
              {etapa.emBreve && (
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide">
                  em breve
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

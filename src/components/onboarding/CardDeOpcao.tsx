import type { Opcao } from "@/lib/onboarding/perguntas";

/**
 * Um card selecionável do onboarding.
 *
 * POR QUE É UM BOTÃO DE VERDADE, E NÃO UMA CAIXINHA BONITA
 *
 * Um `div` com `onClick` parece igual na tela e é inútil para quem navega por
 * teclado ou usa leitor de tela: não recebe foco, não responde ao Enter e não
 * anuncia se está marcado. Aqui é um botão, com `aria-pressed` dizendo em voz
 * alta se está escolhido.
 *
 * E A SELEÇÃO NÃO DEPENDE SÓ DA COR
 *
 * Quem não distingue as cores precisa enxergar a diferença de outro jeito. Por
 * isso o card marcado ganha também borda mais grossa e um sinal de conferido —
 * é a etiqueta com o nome, além da etiqueta colorida.
 */
export function CardDeOpcao({
  opcao,
  marcado,
  onEscolher,
}: {
  opcao: Opcao;
  marcado: boolean;
  onEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={marcado}
      className={`group relative flex min-h-[68px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors motion-safe:duration-150 ${
        marcado
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      {opcao.icone && (
        <span aria-hidden="true" className="shrink-0 text-2xl leading-none">
          {opcao.icone}
        </span>
      )}
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{opcao.rotulo}</span>
      {/* O sinal de conferido: a segunda pista, além da cor. */}
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-black ${
          marcado
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-transparent"
        }`}
      >
        ✓
      </span>
    </button>
  );
}

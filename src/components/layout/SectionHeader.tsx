import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  description?: string;
  /** Ação principal da seção — vai para baixo do título em telas estreitas. */
  action?: ReactNode;
};

/**
 * Cabeçalho de seção com título e ação.
 *
 * O padrão anterior (`flex justify-between` sem quebra) espremia o título
 * contra o botão a partir de ~360px. Aqui a ação ocupa a linha inteira abaixo
 * do título no celular e volta para a direita quando há espaço — sem
 * posicionamento absoluto e sem esconder o botão.
 */
export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* `min-w-0` é o que permite o título truncar em vez de empurrar a ação
          para fora do container. */}
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}

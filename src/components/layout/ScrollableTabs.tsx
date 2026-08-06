import { useEffect, useRef } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ScrollableTabItem = {
  value: string;
  label: string;
  /** Destaca a aba (usada em "Config."), sem depender só de cor. */
  emphasis?: boolean;
};

export type ScrollableTabsProps = {
  items: readonly ScrollableTabItem[];
  /** Aba ativa — usada para trazê-la ao campo de visão automaticamente. */
  value: string;
  className?: string;
};

/**
 * Barra de abas que rola na horizontal em vez de quebrar em várias linhas.
 *
 * Substitui o padrão `grid-cols-2` que colocava seis abas em três linhas no
 * celular e invadia o conteúdo abaixo. Os rótulos ficam em `nowrap`, a barra
 * de rolagem é invisível e a aba ativa é trazida à vista quando muda — sem
 * isso, selecionar "Config." pelo teclado deixava o foco fora da tela.
 */
export function ScrollableTabs({ items, value, className = "" }: ScrollableTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const active = container.querySelector<HTMLElement>(`[data-value="${value}"]`);
    if (!active) return;

    // `nearest` evita o salto vertical que `center` provoca quando a barra
    // está próxima ao topo da página.
    active.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <div ref={listRef} className={`scroll-x-hidden -mx-1 px-1 ${className}`}>
      <TabsList className="inline-flex h-auto w-max gap-1 bg-muted/50 p-1">
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            data-value={item.value}
            className={`h-11 whitespace-nowrap px-3.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm ${
              item.emphasis ? "font-semibold text-primary" : ""
            }`}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

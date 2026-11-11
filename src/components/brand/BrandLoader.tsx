import { BrandSymbol } from "@/components/brand/BrandLogo";

/**
 * A tela de "carregando" com a cara da marca.
 *
 * Antes era só a palavra "Carregando..." no meio de uma tela vazia — em
 * internet lenta, parecia que o sistema tinha travado. O símbolo pulsando
 * diz a mesma coisa que o texto, mas deixa claro que a página certa abriu e
 * está trabalhando.
 *
 * `role="status"` faz o leitor de tela anunciar o texto; quem pediu menos
 * animação no aparelho vê o símbolo parado (a regra global de
 * `prefers-reduced-motion` desliga o pulso).
 */
export function BrandLoader({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        <BrandSymbol decorative eager className="h-12 animate-pulse" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

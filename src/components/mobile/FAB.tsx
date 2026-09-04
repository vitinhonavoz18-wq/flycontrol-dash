import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  label?: string;
  extended?: boolean;
};

/**
 * Floating Action Button (mobile-first).
 * Sits above the bottom nav. On desktop it floats bottom-right normally.
 */
export const FAB = forwardRef<HTMLButtonElement, Props>(function FAB(
  { icon, label, extended, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        // Abaixo da barra inferior na escala de empilhamento: o FAB flutua
        // sobre o conteúdo, nunca sobre a navegação.
        "fixed right-4 z-[var(--z-sticky-header)] inline-flex items-center justify-center gap-2",
        "rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30",
        "transition-transform duration-150 active:scale-95",
        extended ? "h-14 px-5 text-base font-semibold" : "h-14 w-14",
        // Altura da barra vinda do token, em vez do 72px literal de antes.
        "bottom-[calc(var(--bottom-nav-offset)+0.75rem)] md:bottom-6",
        className,
      )}
      aria-label={label}
    >
      <span className="h-6 w-6 grid place-items-center">{icon}</span>
      {extended && label ? <span>{label}</span> : null}
    </button>
  );
});

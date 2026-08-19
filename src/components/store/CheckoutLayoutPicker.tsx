import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CHECKOUT_LAYOUTS,
  CHECKOUT_LAYOUT_INFO,
  normalizeCheckoutLayout,
  type CheckoutLayout,
} from "@/lib/site/checkoutLayout";

interface Props {
  /** Valor atualmente salvo (vindo de `site_settings.checkout_layout`). */
  current: unknown;
  saving: boolean;
  onSave: (layout: CheckoutLayout) => void | Promise<void>;
}

/**
 * Desenho em miniatura de cada modelo.
 *
 * Vale mais que um texto: "painel lateral" e "de baixo para cima" só ficam
 * claros vendo. É a diferença entre ler "mesa perto da janela" e ver a planta
 * do salão. Não usa imagem — é feito com blocos, então acompanha o tema claro
 * ou escuro do painel sem precisar de dois arquivos.
 */
function LayoutPreview({ layout, active }: { layout: CheckoutLayout; active: boolean }) {
  const sheet = active ? "bg-primary" : "bg-muted-foreground/40";

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto h-28 w-20 overflow-hidden rounded-lg border-2 border-border bg-background"
    >
      {/* Conteúdo da página por trás, sempre igual nos dois. */}
      <div className="space-y-1 p-1.5">
        <div className="h-2 w-full rounded-sm bg-muted" />
        <div className="h-1 w-3/4 rounded-sm bg-muted" />
        <div className="h-1 w-2/3 rounded-sm bg-muted" />
      </div>

      {/* Escurecimento: os dois modelos escurecem o fundo ao abrir. */}
      <div className="absolute inset-0 bg-foreground/20" />

      {layout === "lateral" ? (
        // Entra pela direita e vai até o pé da tela.
        <div className={`absolute inset-y-0 right-0 w-[58%] ${sheet}`}>
          <div className="space-y-1 p-1.5">
            <div className="h-1 w-2/3 rounded-sm bg-background/70" />
            <div className="h-1 w-full rounded-sm bg-background/40" />
            <div className="h-1 w-3/4 rounded-sm bg-background/40" />
          </div>
        </div>
      ) : (
        // Sobe de baixo, ocupa a largura toda e tem o topo arredondado.
        <div className={`absolute inset-x-0 bottom-0 h-[62%] rounded-t-xl ${sheet}`}>
          <div className="mx-auto mt-1 h-0.5 w-6 rounded-full bg-background/60" />
          <div className="space-y-1 p-1.5">
            <div className="h-1 w-2/3 rounded-sm bg-background/70" />
            <div className="h-1 w-full rounded-sm bg-background/40" />
            <div className="h-1 w-3/4 rounded-sm bg-background/40" />
          </div>
        </div>
      )}
    </div>
  );
}

export function CheckoutLayoutPicker({ current, saving, onSave }: Props) {
  const savedLayout = normalizeCheckoutLayout(current);
  const [selected, setSelected] = useState<CheckoutLayout>(savedLayout);

  // Só há o que salvar quando a escolha na tela difere da que está no banco.
  const isDirty = selected !== savedLayout;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {CHECKOUT_LAYOUTS.map((layout) => {
          const info = CHECKOUT_LAYOUT_INFO[layout];
          const active = selected === layout;
          return (
            <button
              key={layout}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(layout)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <LayoutPreview layout={layout} active={active} />

              <div className="mt-3 flex items-start justify-between gap-2">
                <span className="text-sm font-bold">{info.title}</span>
                {active && (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{info.description}</p>

              {layout === savedLayout && (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Em uso
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void onSave(selected)} disabled={!isDirty || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Salvar configuração
        </Button>
        {isDirty && !saving && (
          <span className="text-xs text-muted-foreground">
            Escolha alterada — clique em salvar para valer no site.
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Vale só para este estabelecimento. Quem não escolher nada continua no modelo lateral, do
        jeito que sempre foi.
      </p>
    </div>
  );
}

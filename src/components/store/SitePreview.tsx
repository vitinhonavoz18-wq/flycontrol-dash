import { useMemo } from "react";
import { ShoppingBag, Star, Plus } from "lucide-react";
import { tokensDoTema, variaveisCss } from "@/lib/theme/templates";
import type { Hsl } from "@/lib/theme/color";

/**
 * A prévia do cardápio, que muda enquanto a cor é arrastada.
 *
 * Não é uma foto: é o cardápio de verdade em miniatura, pintado pelas mesmas
 * variáveis de cor que o site público usa. Por isso ela não tem NENHUM código
 * de cor escrito à mão — tudo sai de `--site-*`, exatamente como lá.
 *
 * Se um dia alguém trocar a cor de um botão aqui por um código fixo, a prévia
 * deixa de valer: seria como a foto do prato mostrar um acompanhamento que a
 * cozinha não faz mais.
 */

type Props = {
  template: string | null | undefined;
  primaria: Hsl | null;
  secundaria: Hsl | null;
  /** A cor de fundo escolhida. Arrasta card, borda e cor do texto junto. */
  fundo: Hsl | null;
  nomeDaLoja: string;
};

const PRATOS = [
  { nome: "Margherita", desc: "Molho, muçarela e manjericão", preco: "R$ 48,90", destaque: true },
  { nome: "Calabresa", desc: "Calabresa fatiada e cebola", preco: "R$ 52,00", destaque: false },
];

export function SitePreview({ template, primaria, secundaria, fundo, nomeDaLoja }: Props) {
  const estilo = useMemo(
    () => variaveisCss(tokensDoTema(template, primaria, secundaria, fundo)) as React.CSSProperties,
    [template, primaria, secundaria, fundo],
  );

  return (
    <div
      style={estilo}
      className="overflow-hidden rounded-xl border border-border bg-[hsl(var(--site-bg))] text-[hsl(var(--site-fg))] shadow-sm"
    >
      {/* Cabeçalho */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3"
        style={{
          background: "hsl(var(--site-header-bg))",
          color: "hsl(var(--site-header-fg))",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black"
            style={{
              background: "hsl(var(--site-primary))",
              color: "hsl(var(--site-primary-fg))",
            }}
          >
            {nomeDaLoja.trim().charAt(0).toUpperCase() || "F"}
          </span>
          <span className="truncate text-sm font-black uppercase tracking-tight">
            {nomeDaLoja || "Sua loja"}
          </span>
        </div>
        <ShoppingBag className="h-4 w-4 shrink-0" />
      </div>

      <div className="space-y-3 p-4">
        {/* Faixa de destaque: é onde a cor primária aparece cheia */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5"
          style={{
            background: "hsl(var(--site-primary))",
            color: "hsl(var(--site-primary-fg))",
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              Promoção do dia
            </p>
            <p className="truncate text-sm font-black">Frete grátis acima de R$ 60</p>
          </div>
          <span className="rounded-md bg-[hsl(var(--site-bg)/0.25)] px-2 py-1 text-[10px] font-black uppercase">
            Hoje
          </span>
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-[hsl(var(--site-primary))]">
          Mais pedidos
        </p>

        {PRATOS.map((p) => (
          <div
            key={p.nome}
            className="flex items-center gap-3 rounded-lg border border-[hsl(var(--site-border))] bg-[hsl(var(--site-card))] p-3"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[hsl(var(--site-muted))]">
              <Star className="h-4 w-4 text-[hsl(var(--site-muted-fg))]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-black uppercase tracking-tight">{p.nome}</p>
                {p.destaque && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase"
                    style={{
                      background: "hsl(var(--site-secondary))",
                      color: "hsl(var(--site-bg))",
                    }}
                  >
                    Novo
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-[hsl(var(--site-muted-fg))]">{p.desc}</p>
              <p className="mt-0.5 text-sm font-black text-[hsl(var(--site-primary))]">{p.preco}</p>
            </div>
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
              style={{
                background: "hsl(var(--site-primary))",
                color: "hsl(var(--site-primary-fg))",
              }}
            >
              <Plus className="h-4 w-4" />
            </span>
          </div>
        ))}

        {/* Rodapé do carrinho: preço somado usa a cor secundária, igual ao site */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--site-border))] bg-[hsl(var(--site-muted))] p-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--site-muted-fg))]">
              Total
            </p>
            <p className="text-lg font-black text-[hsl(var(--site-secondary))]">R$ 100,90</p>
          </div>
          <span
            className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wide"
            style={{
              background: "hsl(var(--site-primary))",
              color: "hsl(var(--site-primary-fg))",
            }}
          >
            Finalizar
          </span>
        </div>
      </div>
    </div>
  );
}

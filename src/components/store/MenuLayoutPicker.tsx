import { Check, LayoutGrid, Search, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { LAYOUTS, layoutPorId, layoutRecomendadoPara, type LayoutId } from "@/lib/menu/layouts";

/**
 * "Tipo de cardápio" — a escolha de como o cardápio se organiza.
 *
 * O QUE ISTO NÃO É
 *
 * Não é escolher cor nem foto: isso continua logo acima, em Aparência. Aqui
 * se escolhe a ORGANIZAÇÃO. Uma adega e uma pizzaria podem ter a mesma cor e
 * ainda assim precisam de cardápios diferentes: quem entra numa adega já sabe
 * o que quer e procura pelo nome; quem entra numa pizzaria quer ver os
 * sabores. É a diferença entre a prateleira do mercado e o balcão da padaria.
 *
 * A recomendação sai do tipo de estabelecimento cadastrado em Identidade. Mas
 * ela é só recomendação: o lojista pode escolher outra e continua sendo o que
 * é. É por isso que o tipo do negócio e o layout são duas coisas separadas.
 */

type Props = {
  /** O que está gravado em `business_type`, na aba Identidade. */
  businessType: string | null | undefined;
  /** O layout escolhido, ou nulo para "usar o recomendado". */
  valor: LayoutId | null;
  onChange: (novo: LayoutId | null) => void;
  disabled?: boolean;
};

export function MenuLayoutPicker({ businessType, valor, onChange, disabled }: Props) {
  const recomendado = layoutRecomendadoPara(businessType);
  const emUso = valor ?? recomendado ?? "generic";
  const nomeDoRecomendado = layoutPorId(recomendado ?? "generic")?.nome ?? "Padrão";

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" aria-hidden="true" />
          Tipo de cardápio
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Muda como o cardápio se organiza para quem vai pedir: o que aparece primeiro, o tamanho
          dos produtos na tela e se a busca fica em destaque. As cores continuam sendo as suas.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {businessType ? (
            <>
              Seu tipo de estabelecimento é{" "}
              <strong className="text-foreground">{businessType}</strong>, então recomendamos o
              cardápio <strong className="text-foreground">{nomeDoRecomendado}</strong>.
            </>
          ) : (
            <>
              Você ainda não escolheu o tipo do seu estabelecimento — por isso a recomendação é o{" "}
              <strong className="text-foreground">Padrão</strong>.
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          O tipo do estabelecimento é editado na aba Identidade. Mudar o cardápio aqui não muda o
          tipo do seu negócio.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Tipo de cardápio"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {LAYOUTS.map((l) => {
          const selecionado = emUso === l.id;
          const ehRecomendado = recomendado === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selecionado}
              disabled={disabled}
              // Escolher o recomendado grava nulo: assim, se o lojista mudar o
              // tipo do negócio depois, o cardápio acompanha sozinho em vez de
              // ficar preso na escolha antiga.
              onClick={() => onChange(ehRecomendado ? null : l.id)}
              className={`rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50 ${
                selecionado ? "border-primary bg-primary/5" : "border-input hover:border-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold">{l.nome}</p>
                {selecionado && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase text-primary-foreground">
                    <Check className="h-3 w-3" aria-hidden="true" /> Em uso
                  </span>
                )}
                {!selecionado && ehRecomendado && (
                  <span className="shrink-0 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                    Recomendado
                  </span>
                )}
              </div>

              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{l.descricao}</p>

              <PreviaDoLayout layout={l} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const NOME_DO_BLOCO: Record<string, string> = {
  capa: "Capa",
  busca: "Busca",
  categorias: "Categorias",
  populares: "Destaques",
  pizzas: "Pizzas",
  combos: "Combos",
  cardapio: "Produtos",
  bebidas: "Bebidas",
};

/**
 * A prévia: a ordem dos blocos e a densidade de produtos, em miniatura.
 *
 * Não é uma foto do cardápio pronto — é a planta baixa. Mostra o que muda de
 * verdade (a ordem e quantos produtos cabem na tela), que é justamente o que
 * uma foto bonita esconderia.
 */
function PreviaDoLayout({ layout }: { layout: (typeof LAYOUTS)[number] }) {
  return (
    <div className="mt-2.5 space-y-1.5 rounded-lg border bg-background p-2">
      <div className="flex flex-wrap gap-1">
        {layout.ordem.map((bloco, i) => (
          <span
            key={bloco}
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              bloco === "busca" && layout.buscaEmDestaque
                ? "bg-primary/15 text-primary"
                : i === 0
                  ? "bg-foreground/10 text-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {NOME_DO_BLOCO[bloco] ?? bloco}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {layout.buscaEmDestaque && (
          <span className="flex h-4 flex-1 items-center gap-1 rounded bg-primary/15 px-1">
            <Search className="h-2.5 w-2.5 text-primary" aria-hidden="true" />
            <span className="h-1 flex-1 rounded bg-primary/40" />
          </span>
        )}
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${layout.colunas}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: layout.colunas * 2 }, (_, i) => (
          <span key={i} className="h-4 rounded bg-muted" />
        ))}
      </div>
      <p className="text-[9px] text-muted-foreground">
        {layout.colunas === 1
          ? "Um produto por linha"
          : `${layout.colunas} produtos por linha no computador`}
      </p>
    </div>
  );
}

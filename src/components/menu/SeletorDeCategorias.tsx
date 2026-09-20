import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * "Exibir este adicional em" — escolha de várias categorias de uma vez.
 *
 * POR QUE NÃO É UMA LISTA SUSPENSA COMUM
 *
 * Lista suspensa aceita uma escolha só. Bacon serve para pastel E para
 * hambúrguer ao mesmo tempo, então aqui cada categoria é uma caixinha que
 * liga e desliga sozinha, e o lojista marca quantas quiser.
 *
 * NENHUMA MARCADA QUER DIZER "EM TODAS"
 *
 * Esta é a regra mais importante da tela, e ela está escrita na própria tela
 * para ninguém precisar adivinhar. Adicional sem nenhuma categoria marcada
 * continua aparecendo no cardápio inteiro, como sempre apareceu. É o que
 * garante que nada some do cardápio de quem já está vendendo.
 */
export type CategoriaEscolhivel = { id: string; name: string };

export function SeletorDeCategorias({
  categorias,
  escolhidas,
  onMudar,
  carregando,
}: {
  categorias: CategoriaEscolhivel[];
  escolhidas: string[];
  onMudar: (ids: string[]) => void;
  carregando?: boolean;
}) {
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return categorias;
    return categorias.filter((c) => c.name.toLowerCase().includes(termo));
  }, [categorias, busca]);

  // "Selecionar todas" age sobre o que está À VISTA. Com uma busca ativa,
  // marcar tudo o que está filtrado é o que a pessoa espera — marcar também as
  // que ela não está vendo seria o botão fazendo mais do que aparenta.
  const todasVisiveisMarcadas =
    visiveis.length > 0 && visiveis.every((c) => escolhidas.includes(c.id));

  function alternar(id: string) {
    onMudar(escolhidas.includes(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id]);
  }

  function alternarTodas() {
    if (todasVisiveisMarcadas) {
      const idsVisiveis = new Set(visiveis.map((c) => c.id));
      onMudar(escolhidas.filter((id) => !idsVisiveis.has(id)));
    } else {
      onMudar(Array.from(new Set([...escolhidas, ...visiveis.map((c) => c.id)])));
    }
  }

  if (carregando) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
        Carregando categorias...
      </div>
    );
  }

  if (categorias.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
        Nenhuma categoria cadastrada ainda. Este adicional vai aparecer em todo o cardápio.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* A busca só aparece quando a lista é grande o bastante para justificar.
          Campo de busca em cima de cinco itens é enfeite que ocupa a tela do
          celular sem resolver nada. */}
      {categorias.length > 6 && (
        <div className="relative border-b p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar categoria"
            className="h-10 border-0 pl-9 shadow-none focus-visible:ring-0"
          />
        </div>
      )}

      {/* Altura limitada com rolagem própria: com trinta categorias, a lista
          inteira empurraria os botões Salvar e Cancelar para fora da tela do
          celular — e o lojista não teria como salvar o que acabou de marcar. */}
      <div className="max-h-56 overflow-y-auto p-1.5">
        {visiveis.map((c) => {
          const marcada = escolhidas.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={marcada}
              onClick={() => alternar(c.id)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                  marcada ? "border-primary bg-primary text-primary-foreground" : "border-input"
                }`}
              >
                {marcada && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className={marcada ? "font-semibold" : ""}>{c.name}</span>
            </button>
          );
        })}

        {visiveis.length === 0 && (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            Nenhuma categoria com esse nome.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-2.5 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {escolhidas.length === 0
            ? "Aparece em todas as categorias"
            : `${escolhidas.length} categoria${escolhidas.length > 1 ? "s" : ""} selecionada${
                escolhidas.length > 1 ? "s" : ""
              }`}
        </span>
        <div className="flex gap-1">
          {escolhidas.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onMudar([])}>
              Limpar
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={alternarTodas}>
            {todasVisiveisMarcadas ? "Desmarcar todas" : "Selecionar todas"}
          </Button>
        </div>
      </div>
    </div>
  );
}

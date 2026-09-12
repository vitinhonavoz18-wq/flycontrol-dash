import type { LucideIcon } from "lucide-react";

/**
 * As abas das telas do Painel Admin.
 *
 * Mesmo desenho das abas do Estoque & PDV, de propósito: duas telas do mesmo
 * sistema que fazem a mesma coisa devem ter a mesma cara. Menu que muda de
 * jeito a cada tela obriga a pessoa a reaprender a andar em cada cômodo da
 * própria casa.
 */
export type AbaDaSecao<T extends string> = {
  id: T;
  rotulo: string;
  icone: LucideIcon;
};

export function AbasDaSecao<T extends string>({
  abas,
  ativa,
  onEscolher,
}: {
  abas: readonly AbaDaSecao<T>[];
  ativa: T;
  onEscolher: (id: T) => void;
}) {
  return (
    // Rola para o lado no celular em vez de espremer os rótulos até ficarem
    // ilegíveis.
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-1 rounded-xl bg-muted/50 p-1">
        {abas.map((aba) => {
          const Icone = aba.icone;
          const estaAtiva = aba.id === ativa;
          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => onEscolher(aba.id)}
              aria-current={estaAtiva ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                estaAtiva
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {aba.rotulo}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

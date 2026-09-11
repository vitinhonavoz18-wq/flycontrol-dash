import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowDownToLine, ClipboardList, Package, ShoppingCart } from "lucide-react";
import { RequireFeature } from "@/components/PremiumFeatureLock";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { LojaDoEstoqueProvider, useLojaDoEstoque } from "@/lib/inventory/loja-context";

export const Route = createFileRoute("/_app/inventory")({ component: LayoutDoEstoque });

/**
 * A moldura do módulo Estoque & PDV: o cabeçalho, o seletor de loja e as abas.
 *
 * `RequireFeature` é só a cortina — ela evita que quem não tem o plano veja
 * uma tela quebrada. A tranca de verdade está no servidor: cada função de
 * `inventory.functions.ts` confere dono e plano antes de responder, e as
 * regras do banco recusam dados de outra loja. Esconder tela nunca protegeu
 * nada, porque quem sabe o endereço chama direto.
 */
function LayoutDoEstoque() {
  return (
    <RequireFeature feature="inventory">
      <LojaDoEstoqueProvider>
        <Moldura />
      </LojaDoEstoqueProvider>
    </RequireFeature>
  );
}

type Aba = {
  to: "/inventory" | "/inventory/products" | "/inventory/pos" | "/inventory/movements";
  rotulo: string;
  icone: typeof Package;
  exata?: boolean;
};

const ABAS: Aba[] = [
  { to: "/inventory", rotulo: "Visão Geral", icone: Package, exata: true },
  { to: "/inventory/products", rotulo: "Produtos", icone: ClipboardList },
  { to: "/inventory/pos", rotulo: "Venda no Balcão", icone: ShoppingCart },
  { to: "/inventory/movements", rotulo: "Movimentações", icone: ArrowDownToLine },
];

function Moldura() {
  const { lojas, tenantId, setTenantId } = useLojaDoEstoque();
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Package className="h-6 w-6 text-primary md:h-7 md:w-7" aria-hidden="true" />
            Estoque &amp; PDV
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle o que entra, o que sai e o que está acabando.
          </p>
        </div>

        {lojas.length > 1 && (
          <PizzeriaSelector
            pizzerias={lojas as never}
            activeId={tenantId}
            onSelect={(id: string) => setTenantId(id)}
          />
        )}
      </div>

      {/* As abas rolam para o lado no celular em vez de espremerem os rótulos
          até virarem ilegíveis. */}
      <nav className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1 rounded-xl bg-muted/50 p-1">
          {ABAS.map((aba) => {
            const ativa = aba.exata ? caminho === aba.to : caminho.startsWith(aba.to);
            const Icone = aba.icone;
            return (
              <Link
                key={aba.to}
                to={aba.to}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  ativa
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={ativa ? "page" : undefined}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {aba.rotulo}
              </Link>
            );
          })}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Package, PackageX, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireFeature } from "@/components/PremiumFeatureLock";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { formatCents } from "@/lib/billing/money";
import { visaoGeralDoEstoque, ROTULO_DA_SITUACAO } from "@/lib/inventory/inventory.functions";
import type { SituacaoDoEstoque } from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory")({ component: PaginaDeEstoque });

/**
 * A porta do módulo Estoque & PDV.
 *
 * `RequireFeature` é só a cortina: ela evita que quem não tem o plano veja uma
 * tela quebrada. A tranca de verdade está no servidor — cada função de
 * `inventory.functions.ts` confere dono e plano antes de responder, e as
 * regras do banco recusam dados de outra loja. Esconder tela nunca protegeu
 * nada: quem sabe o endereço chama direto.
 */
function PaginaDeEstoque() {
  return (
    <RequireFeature feature="inventory">
      <VisaoGeral />
    </RequireFeature>
  );
}

type Loja = { id: string; name: string; slug?: string };

/** Quantidade sem casas decimais à toa: 12 em vez de 12,000. */
function qtd(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v)
    ? String(v)
    : v
        .toFixed(3)
        .replace(/\.?0+$/, "")
        .replace(".", ",");
}

const CORES_DA_SITUACAO: Record<SituacaoDoEstoque, string> = {
  sem_estoque: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  baixo: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

function VisaoGeral() {
  const { user, isSuperAdmin } = useAuth();
  const buscar = useServerFn(visaoGeralDoEstoque);

  const [lojas, setLojas] = useState<Loja[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [dados, setDados] = useState<Awaited<ReturnType<typeof visaoGeralDoEstoque>> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let q = supabase
        .from("pizzerias")
        .select("id, name, slug")
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("created_at");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      const lista = (data ?? []) as Loja[];
      setLojas(lista);
      setTenantId((atual) => atual || lista[0]?.id || "");
      if (!lista.length) setCarregando(false);
    })();
  }, [user, isSuperAdmin]);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      setDados(await buscar({ data: { tenantId } }));
    } catch (e) {
      const bruto = e instanceof Error ? e.message : "";
      // O módulo depende de tabelas que entram por migração. Enquanto elas não
      // forem aplicadas no banco, a tela existe e a consulta falha — e o erro
      // cru do banco ("relation does not exist") não diz nada para o lojista.
      // Melhor uma frase que explique o que está faltando e de quem é a ação.
      const faltaInstalar =
        bruto.includes("does not exist") ||
        bruto.includes("schema cache") ||
        bruto.includes("inventory_products");
      setErro(
        faltaInstalar
          ? "O módulo de Estoque ainda não foi instalado no banco desta conta. Peça para aplicar a atualização — nada do que você já usa foi afetado."
          : bruto || "Não consegui carregar o estoque.",
      );
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cards = useMemo(() => {
    if (!dados) return [];
    return [
      {
        rotulo: "Valor do estoque (custo)",
        valor: formatCents(dados.valorCustoCents),
        destaque: true,
      },
      { rotulo: "Potencial de venda", valor: formatCents(dados.valorVendaCents) },
      { rotulo: "Vendido no balcão hoje", valor: formatCents(dados.vendidoBalcaoHojeCents) },
      { rotulo: "Produtos cadastrados", valor: String(dados.cadastrados) },
      { rotulo: "Produtos ativos", valor: String(dados.ativos) },
      { rotulo: "Itens em estoque", valor: qtd(dados.itensTotais) },
      { rotulo: "Entradas hoje", valor: String(dados.entradasHoje) },
      { rotulo: "Saídas hoje", valor: String(dados.saidasHoje) },
      { rotulo: "Vendas hoje", valor: String(dados.vendasHoje) },
    ];
  }, [dados]);

  if (!lojas.length && !carregando) {
    return (
      <div className="p-6 md:p-8">
        <Cabecalho />
        <VazioSemLoja />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Cabecalho />
        <div className="flex items-center gap-2">
          {lojas.length > 1 && (
            <PizzeriaSelector
              pizzerias={lojas as never}
              activeId={tenantId}
              onSelect={(id: string) => setTenantId(id)}
            />
          )}
          <Button variant="outline" size="icon" onClick={carregar} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {erro && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-400">
          {erro}
        </div>
      )}

      {carregando && !dados ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : dados && dados.cadastrados === 0 ? (
        <VazioSemProdutos />
      ) : dados ? (
        <>
          {/* Os três números que dizem se está tudo bem, em destaque. */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <CardDeSituacao
              icone={<Package className="h-5 w-5" />}
              rotulo="Estoque normal"
              valor={dados.normal}
              tom="emerald"
            />
            <CardDeSituacao
              icone={<AlertTriangle className="h-5 w-5" />}
              rotulo="Estoque baixo"
              valor={dados.baixo}
              tom="amber"
            />
            <CardDeSituacao
              icone={<PackageX className="h-5 w-5" />}
              rotulo="Sem estoque"
              valor={dados.semEstoque}
              tom="rose"
            />
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Card key={c.rotulo} className={c.destaque ? "border-primary/30 bg-primary/5" : ""}>
                <CardContent className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {c.rotulo}
                  </p>
                  <p
                    className={`mt-1 font-black tabular-nums ${c.destaque ? "text-2xl text-primary" : "text-xl"}`}
                  >
                    {c.valor}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {dados.atencao.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
                Atenção necessária
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dados.atencao.map((p) => (
                  <CardDeAtencao key={p.id} produto={p} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function Cabecalho() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
        <Package className="h-7 w-7 text-primary" aria-hidden="true" />
        Estoque &amp; PDV
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Controle o que entra, o que sai e o que está acabando.
      </p>
    </div>
  );
}

function CardDeSituacao({
  icone,
  rotulo,
  valor,
  tom,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number;
  tom: "emerald" | "amber" | "rose";
}) {
  const tons = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400",
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${tons[tom]}`}>
      <div className="shrink-0">{icone}</div>
      <div className="min-w-0">
        <p className="text-2xl font-black leading-none tabular-nums">{valor}</p>
        {/* O texto vai junto da cor de propósito: quem não distingue verde de
            vermelho precisa conseguir ler a situação. */}
        <p className="mt-1 text-xs font-medium">{rotulo}</p>
      </div>
    </div>
  );
}

function CardDeAtencao({
  produto,
}: {
  produto: {
    id: string;
    name: string;
    image_url: string | null;
    base_unit: string;
    stock_base: number;
    min_stock_base: number;
    situacao: SituacaoDoEstoque;
  };
}) {
  const semEstoque = produto.situacao === "sem_estoque";

  return (
    <Card className={semEstoque ? "border-rose-500/40" : "border-amber-500/40"}>
      <CardContent className="flex gap-3 p-4">
        {produto.image_url ? (
          <img
            src={produto.image_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          // Sem foto, um lugar elegante em vez de um buraco na tela.
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Badge
            variant="outline"
            className={`mb-1 text-[10px] ${CORES_DA_SITUACAO[produto.situacao]}`}
          >
            {semEstoque ? "🔴" : "⚠️"} {ROTULO_DA_SITUACAO[produto.situacao]}
          </Badge>
          <p className="truncate font-bold leading-tight">{produto.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {semEstoque ? (
              <>Acabou — nenhum {produto.base_unit} disponível</>
            ) : (
              <>
                Restam <strong className="text-foreground">{qtd(produto.stock_base)}</strong>{" "}
                {produto.base_unit} · mínimo {qtd(produto.min_stock_base)}
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VazioSemLoja() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <Package className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="mt-3 font-medium">Nenhuma loja encontrada</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Cadastre sua loja no painel de pedidos para começar a controlar o estoque.
      </p>
    </div>
  );
}

function VazioSemProdutos() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Package className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-bold">Seu estoque ainda está vazio</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Cadastre seu primeiro produto para começar a controlar entradas, saídas e vendas no balcão.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button
          className="gap-2"
          onClick={() => toast.info("A tela de cadastro de produtos entra na próxima etapa.")}
        >
          <Package className="h-4 w-4" /> Cadastrar produto
        </Button>
      </div>
    </div>
  );
}

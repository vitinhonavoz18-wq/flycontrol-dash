import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/billing/money";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { qtd } from "@/lib/inventory/formato";
import {
  arquivarProdutoDeEstoque,
  listarCategoriasDeEstoque,
  listarProdutosDeEstoque,
  ROTULO_DA_SITUACAO,
} from "@/lib/inventory/inventory.functions";
import type { SituacaoDoEstoque } from "@/lib/inventory/inventory.functions";
import { FormularioDeProduto } from "@/components/inventory/FormularioDeProduto";
import { DialogoDeMovimentacao } from "@/components/inventory/DialogoDeMovimentacao";

export const Route = createFileRoute("/_app/inventory/products")({ component: TelaDeProdutos });

const CORES: Record<SituacaoDoEstoque, string> = {
  sem_estoque: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  baixo: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

type Produto = Awaited<ReturnType<typeof listarProdutosDeEstoque>>["itens"][number];

function TelaDeProdutos() {
  const { tenantId } = useLojaDoEstoque();
  const listar = useServerFn(listarProdutosDeEstoque);
  const listarCategorias = useServerFn(listarCategoriasDeEstoque);
  const arquivar = useServerFn(arquivarProdutoDeEstoque);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [situacao, setSituacao] = useState<SituacaoDoEstoque | "todos">("todos");
  const [ordenar, setOrdenar] = useState<"nome" | "menor_estoque" | "maior_estoque" | "recentes">(
    "nome",
  );
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Array<{ id: string; name: string }>>([]);

  const [editando, setEditando] = useState<{ id?: string } | null>(null);
  const [movimentando, setMovimentando] = useState<Produto | null>(null);

  // A busca espera você parar de digitar.
  //
  // Sem isso, escrever "coca" dispararia quatro consultas — e num mercado com
  // milhares de itens são quatro varreduras para uma pergunta só.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [busca]);

  useEffect(() => {
    if (!tenantId) return;
    listarCategorias({ data: { tenantId } })
      .then((c) => setCategorias(c))
      .catch(() => setCategorias([]));
  }, [tenantId, listarCategorias]);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await listar({
        data: {
          tenantId,
          busca: buscaAplicada,
          categoriaId: categoria === "todas" ? undefined : categoria,
          situacao: situacao === "todos" ? undefined : situacao,
          ordenar,
          pagina,
        },
      });
      setItens(r.itens);
      setTotal(r.total);
    } catch (e) {
      const bruto = e instanceof Error ? e.message : "";
      setErro(
        bruto.includes("does not exist") || bruto.includes("schema cache")
          ? "O módulo de Estoque ainda não foi instalado no banco desta conta."
          : bruto || "Não consegui carregar os produtos.",
      );
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, buscaAplicada, categoria, situacao, ordenar, pagina, listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleArquivar(p: Produto) {
    if (
      !confirm(
        `Remover "${p.name}" do estoque?\n\nO histórico dele fica guardado — o produto só deixa de aparecer nas listas.`,
      )
    )
      return;
    try {
      await arquivar({ data: { tenantId, id: p.id } });
      toast.success(`${p.name} foi removido do estoque.`);
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui remover.");
    }
  }

  const paginas = Math.max(1, Math.ceil(total / 30));
  const semFiltros = !buscaAplicada && categoria === "todas" && situacao === "todos";

  const filtros = useMemo(
    () => (
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, SKU ou código de barras"
            className="pl-9"
            aria-label="Buscar produto"
          />
        </div>

        <Select
          value={categoria}
          onValueChange={(v) => {
            setCategoria(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={situacao}
          onValueChange={(v) => {
            setSituacao(v as SituacaoDoEstoque | "todos");
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as situações</SelectItem>
            <SelectItem value="baixo">Estoque baixo</SelectItem>
            <SelectItem value="sem_estoque">Sem estoque</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ordenar} onValueChange={(v) => setOrdenar(v as typeof ordenar)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome</SelectItem>
            <SelectItem value="menor_estoque">Menor estoque</SelectItem>
            <SelectItem value="maior_estoque">Maior estoque</SelectItem>
            <SelectItem value="recentes">Última movimentação</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setEditando({})} className="gap-2">
          <Plus className="h-4 w-4" /> Novo produto
        </Button>
      </div>
    ),
    [busca, categoria, situacao, ordenar, categorias],
  );

  return (
    <>
      {filtros}

      {erro && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-400">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Vazio comFiltros={!semFiltros} onNovo={() => setEditando({})} />
      ) : (
        <>
          {/* No celular, cards. Tabela de 9 colunas num telefone vira rolagem
              lateral e ninguém acha o que procura. */}
          <div className="grid gap-2 lg:hidden">
            {itens.map((p) => (
              <CardDeProduto
                key={p.id}
                produto={p}
                onEditar={() => setEditando({ id: p.id })}
                onMovimentar={() => setMovimentando(p)}
                onArquivar={() => handleArquivar(p)}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-semibold">Produto</th>
                  <th className="p-3 font-semibold">SKU</th>
                  <th className="p-3 text-right font-semibold">Estoque</th>
                  <th className="p-3 text-right font-semibold">Mínimo</th>
                  <th className="p-3 text-right font-semibold">Custo</th>
                  <th className="p-3 text-right font-semibold">Venda</th>
                  <th className="p-3 font-semibold">Situação</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Foto url={p.image_url} tamanho="h-9 w-9" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      {qtd(p.stock_base)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {p.base_unit}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {qtd(p.min_stock_base)}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCents(p.cost_cents)}</td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatCents(p.price_cents)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[10px] ${CORES[p.situacao]}`}>
                        {ROTULO_DA_SITUACAO[p.situacao]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Movimentar ${p.name}`}
                          onClick={() => setMovimentando(p)}
                        >
                          <ArrowDownToLine className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${p.name}`}
                          onClick={() => setEditando({ id: p.id })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remover ${p.name}`}
                          onClick={() => handleArquivar(p)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pagina} de {paginas} · {total} produtos
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      {editando && (
        <FormularioDeProduto
          tenantId={tenantId}
          produtoId={editando.id}
          categorias={categorias}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            void carregar();
          }}
        />
      )}

      {movimentando && (
        <DialogoDeMovimentacao
          tenantId={tenantId}
          produto={movimentando}
          onFechar={() => setMovimentando(null)}
          onRegistrado={() => {
            setMovimentando(null);
            void carregar();
          }}
        />
      )}
    </>
  );
}

function Foto({ url, tamanho }: { url: string | null; tamanho: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${tamanho} shrink-0 rounded-lg object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <div className={`${tamanho} flex shrink-0 items-center justify-center rounded-lg bg-muted`}>
      <Package className="h-1/2 w-1/2 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}

function CardDeProduto({
  produto,
  onEditar,
  onMovimentar,
  onArquivar,
}: {
  produto: Produto;
  onEditar: () => void;
  onMovimentar: () => void;
  onArquivar: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <Foto url={produto.image_url} tamanho="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-bold leading-tight">{produto.name}</p>
              <span className="shrink-0 font-bold tabular-nums">
                {formatCents(produto.price_cents)}
              </span>
            </div>
            <p className="mt-1 text-sm">
              <strong className="tabular-nums">{qtd(produto.stock_base)}</strong>{" "}
              <span className="text-muted-foreground">
                {produto.base_unit} · mínimo {qtd(produto.min_stock_base)}
              </span>
            </p>
            <Badge variant="outline" className={`mt-1 text-[10px] ${CORES[produto.situacao]}`}>
              {ROTULO_DA_SITUACAO[produto.situacao]}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onMovimentar}>
            <ArrowDownToLine className="h-3.5 w-3.5" /> Entrada / Saída
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button size="icon" variant="ghost" aria-label="Remover" onClick={onArquivar}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Vazio({ comFiltros, onNovo }: { comFiltros: boolean; onNovo: () => void }) {
  if (comFiltros) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Search className="mx-auto h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
        <p className="mt-3 font-medium">Nenhum produto com esses filtros</p>
        <p className="mt-1 text-sm text-muted-foreground">Tente outra busca ou limpe os filtros.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Package className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-bold">Seu estoque ainda está vazio</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Cadastre seu primeiro produto para começar a controlar entradas, saídas e vendas no balcão.
      </p>
      <Button onClick={onNovo} className="mt-5 gap-2">
        <Plus className="h-4 w-4" /> Cadastrar produto
      </Button>
    </div>
  );
}

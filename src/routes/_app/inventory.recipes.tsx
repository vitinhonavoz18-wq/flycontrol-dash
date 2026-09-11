import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChefHat, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { qtd } from "@/lib/inventory/formato";
import {
  excluirVinculoDaFichaTecnica,
  listarCardapioParaFichaTecnica,
  listarFichaTecnica,
  listarProdutosParaFicha,
  salvarVinculoDaFichaTecnica,
  type ItemDeCardapioComFicha,
  type LinhaDaFichaTecnica,
  type ProdutoParaFicha,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/recipes")({ component: FichaTecnica });

/**
 * A receita de cada item do cardápio.
 *
 * É a peça que faltava para o estoque baixar sozinho. O pedido chega dizendo
 * "uma calabresa"; é aqui que está escrito que uma calabresa gasta 1 disco de
 * massa, 150 g de calabresa e 1 embalagem. Sem isso, a baixa automática roda,
 * não encontra receita nenhuma e não desconta nada.
 *
 * Item sem receita não é erro: taxa de entrega e couvert não saem de
 * prateleira nenhuma. Por isso a tela conta quantos itens já têm receita em vez
 * de cobrar todos.
 */
function FichaTecnica() {
  const { tenantId } = useLojaDoEstoque();

  const buscarCardapio = useServerFn(listarCardapioParaFichaTecnica);
  const buscarFicha = useServerFn(listarFichaTecnica);
  const buscarProdutos = useServerFn(listarProdutosParaFicha);
  const salvarVinculo = useServerFn(salvarVinculoDaFichaTecnica);
  const excluirVinculo = useServerFn(excluirVinculoDaFichaTecnica);

  const [cardapio, setCardapio] = useState<ItemDeCardapioComFicha[]>([]);
  const [produtos, setProdutos] = useState<ProdutoParaFicha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  const [selecionado, setSelecionado] = useState<ItemDeCardapioComFicha | null>(null);
  const [ficha, setFicha] = useState<LinhaDaFichaTecnica[]>([]);
  const [carregandoFicha, setCarregandoFicha] = useState(false);

  const [novoProdutoId, setNovoProdutoId] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const [itens, estoque] = await Promise.all([
        buscarCardapio({ data: { tenantId } }),
        buscarProdutos({ data: { tenantId } }),
      ]);
      setCardapio(itens);
      setProdutos(estoque);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar o cardápio.");
    } finally {
      setCarregando(false);
    }
  }, [buscarCardapio, buscarProdutos, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirItem = useCallback(
    async (item: ItemDeCardapioComFicha) => {
      if (!tenantId) return;
      setSelecionado(item);
      setNovoProdutoId("");
      setNovaQuantidade("1");
      setCarregandoFicha(true);
      try {
        setFicha(await buscarFicha({ data: { tenantId, menuProductId: item.id } }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível abrir a receita.");
      } finally {
        setCarregandoFicha(false);
      }
    },
    [buscarFicha, tenantId],
  );

  async function adicionar() {
    if (!tenantId || !selecionado) return;
    const quantidade = Number(novaQuantidade.replace(",", "."));
    if (!novoProdutoId) {
      toast.error("Escolha o produto do estoque que este item consome.");
      return;
    }
    if (!(quantidade > 0)) {
      toast.error("A quantidade precisa ser maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      await salvarVinculo({
        data: {
          tenantId,
          menuProductId: selecionado.id,
          inventoryProductId: novoProdutoId,
          quantityBase: quantidade,
        },
      });
      toast.success("Receita atualizada.");
      setNovoProdutoId("");
      setNovaQuantidade("1");
      await Promise.all([abrirItem(selecionado), carregar()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(linha: LinhaDaFichaTecnica) {
    if (!tenantId || !selecionado) return;
    try {
      await excluirVinculo({ data: { tenantId, id: linha.id } });
      toast.success(`"${linha.produto_nome}" saiu da receita.`);
      await Promise.all([abrirItem(selecionado), carregar()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    }
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return cardapio;
    return cardapio.filter(
      (i) =>
        i.name.toLowerCase().includes(termo) || (i.categoria ?? "").toLowerCase().includes(termo),
    );
  }, [busca, cardapio]);

  const comReceita = cardapio.filter((i) => i.itens_na_ficha > 0).length;

  // Produtos que ainda não estão nesta receita — repetir o mesmo produto só
  // reabriria a mesma linha para reajuste, o que confunde mais que ajuda.
  const disponiveis = produtos.filter((p) => !ficha.some((l) => l.inventory_product_id === p.id));

  if (carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <ChefHat className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            <strong>{comReceita}</strong> de <strong>{cardapio.length}</strong> itens do cardápio já
            descontam do estoque.
          </p>
          {comReceita === 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-600">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              Enquanto nenhum item tiver receita, a baixa automática não tem o que descontar.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar item do cardápio"
                className="pl-9"
              />
            </div>

            <div className="max-h-[28rem] space-y-2 overflow-y-auto">
              {filtrados.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum item encontrado.
                </p>
              )}
              {filtrados.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void abrirItem(item)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selecionado?.id === item.id ? "border-primary bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      {item.categoria && (
                        <p className="truncate text-xs text-muted-foreground">{item.categoria}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        item.itens_na_ficha > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.itens_na_ficha > 0
                        ? `${item.itens_na_ficha} no estoque`
                        : "sem receita"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            {!selecionado ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Escolha um item do cardápio à esquerda para montar a receita dele.
              </p>
            ) : (
              <>
                <div>
                  <h2 className="font-semibold">{selecionado.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    O que sai do estoque a cada unidade vendida.
                  </p>
                </div>

                {carregandoFicha ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="space-y-2">
                    {ficha.length === 0 && (
                      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Este item ainda não desconta nada do estoque.
                      </p>
                    )}
                    {ficha.map((linha) => (
                      <div
                        key={linha.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{linha.produto_nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Consome {qtd(linha.quantity_base)} {linha.produto_unidade} · em estoque:{" "}
                            {qtd(linha.produto_estoque_atual)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void remover(linha)}
                          aria-label={`Remover ${linha.produto_nome} da receita`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="produto-estoque">Produto do estoque</Label>
                    <Select value={novoProdutoId} onValueChange={setNovoProdutoId}>
                      <SelectTrigger id="produto-estoque">
                        <SelectValue placeholder="Escolha o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {disponiveis.length === 0 && (
                          <div className="px-2 py-3 text-sm text-muted-foreground">
                            Todos os produtos do estoque já estão nesta receita.
                          </div>
                        )}
                        {disponiveis.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.base_unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="quantidade-consumida">Quantidade consumida por unidade</Label>
                    <Input
                      id="quantidade-consumida"
                      inputMode="decimal"
                      value={novaQuantidade}
                      onChange={(e) => setNovaQuantidade(e.target.value)}
                      placeholder="1"
                    />
                  </div>

                  <Button onClick={() => void adicionar()} disabled={salvando} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {salvando ? "Salvando…" : "Adicionar à receita"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

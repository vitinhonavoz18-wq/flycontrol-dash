import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDownToLine, Package, Plus, Trash2 } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { deCentavos, paraCentavos, lerNumero } from "@/lib/inventory/formato";
import {
  listarEntradasDeMercadoria,
  listarFornecedores,
  listarProdutosParaFicha,
  registrarEntradaDeMercadoria,
  type EntradaNaLista,
  type Fornecedor,
  type ProdutoParaFicha,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/entries")({ component: Entradas });

type LinhaDoFormulario = {
  produtoId: string;
  quantidade: string;
  custo: string;
};

const LINHA_VAZIA: LinhaDoFormulario = { produtoId: "", quantidade: "", custo: "" };

/**
 * A chegada da mercadoria.
 *
 * Lançar a nota sobe o estoque e registra de quem veio. O custo informado passa
 * a ser o custo da ficha do produto, porque o valor do estoque tem de refletir
 * o que foi pago de verdade na última compra — e não um preço digitado no
 * cadastro há seis meses.
 *
 * A nota entra inteira ou não entra: gravar metade dos itens deixaria o
 * estoque pior do que antes de começar, sem ninguém saber onde parou.
 */
function Entradas() {
  const { tenantId } = useLojaDoEstoque();

  const buscarEntradas = useServerFn(listarEntradasDeMercadoria);
  const buscarFornecedores = useServerFn(listarFornecedores);
  const buscarProdutos = useServerFn(listarProdutosParaFicha);
  const registrar = useServerFn(registrarEntradaDeMercadoria);

  const [entradas, setEntradas] = useState<EntradaNaLista[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<ProdutoParaFicha[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fornecedorId, setFornecedorId] = useState("");
  const [nota, setNota] = useState("");
  const [linhas, setLinhas] = useState<LinhaDoFormulario[]>([{ ...LINHA_VAZIA }]);
  // Nasce junto com o formulário e viaja em toda tentativa de salvar: é o que
  // faz o segundo clique devolver a nota já lançada em vez de lançar de novo.
  const [chaveDaEntrada, setChaveDaEntrada] = useState(() => crypto.randomUUID());

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const [e, f, p] = await Promise.all([
        buscarEntradas({ data: { tenantId } }),
        buscarFornecedores({ data: { tenantId } }),
        buscarProdutos({ data: { tenantId } }),
      ]);
      setEntradas(e);
      setFornecedores(f);
      setProdutos(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar as entradas.");
    } finally {
      setCarregando(false);
    }
  }, [buscarEntradas, buscarFornecedores, buscarProdutos, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNova() {
    setFornecedorId("");
    setNota("");
    setLinhas([{ ...LINHA_VAZIA }]);
    setChaveDaEntrada(crypto.randomUUID());
    setAberto(true);
  }

  function alterarLinha(indice: number, campo: keyof LinhaDoFormulario, valor: string) {
    setLinhas((atual) => atual.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  const totalPrevisto = linhas.reduce((soma, l) => {
    const q = lerNumero(l.quantidade) ?? 0;
    const c = paraCentavos(l.custo) ?? 0;
    return soma + q * c;
  }, 0);

  async function gravar() {
    if (!tenantId) return;

    const itens = linhas
      .map((l) => ({
        productId: l.produtoId,
        quantity: lerNumero(l.quantidade) ?? 0,
        unitCostCents: paraCentavos(l.custo) ?? 0,
      }))
      .filter((i) => i.productId && i.quantity > 0);

    if (itens.length === 0) {
      toast.error("Escolha ao menos um produto e informe a quantidade recebida.");
      return;
    }

    setSalvando(true);
    try {
      const r = await registrar({
        data: {
          tenantId,
          itens,
          supplierId: fornecedorId || undefined,
          invoiceNumber: nota || undefined,
          chaveDaEntrada,
        },
      });

      toast.success(
        r.repetida
          ? "Esta nota já tinha sido lançada — nada foi duplicado."
          : `Entrada lançada: ${r.itens} ${r.itens === 1 ? "produto" : "produtos"}, ${deCentavos(r.total_cents)}.`,
      );
      setAberto(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível lançar a entrada.");
    } finally {
      setSalvando(false);
    }
  }

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
      <div className="flex justify-end">
        <Button onClick={abrirNova}>
          <Plus className="mr-2 h-4 w-4" />
          Lançar entrada
        </Button>
      </div>

      {entradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ArrowDownToLine className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma entrada lançada</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Quando a mercadoria chegar, lance a nota aqui: o estoque sobe sozinho e fica
              registrado de quem veio e quanto custou.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entradas.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {new Date(`${e.entry_date}T12:00:00`).toLocaleDateString("pt-BR")}
                    {e.invoice_number && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        Nota {e.invoice_number}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {e.fornecedor ?? "Sem fornecedor informado"} · {e.itens}{" "}
                    {e.itens === 1 ? "produto" : "produtos"}
                  </p>
                </div>
                <p className="font-semibold">{deCentavos(e.total_cost_cents)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Lançar entrada de mercadoria</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Select value={fornecedorId} onValueChange={setFornecedorId}>
                  <SelectTrigger id="fornecedor">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhum fornecedor cadastrado ainda.
                      </div>
                    )}
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nota">Número da nota</Label>
                <Input
                  id="nota"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Produtos recebidos</Label>
              {linhas.map((linha, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Select
                    value={linha.produtoId}
                    onValueChange={(v) => alterarLinha(i, "produtoId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.base_unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      value={linha.quantidade}
                      onChange={(e) => alterarLinha(i, "quantidade", e.target.value)}
                      placeholder="Quantidade"
                    />
                    <Input
                      inputMode="decimal"
                      value={linha.custo}
                      onChange={(e) => alterarLinha(i, "custo", e.target.value)}
                      placeholder="Custo unitário"
                    />
                    {linhas.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLinhas((a) => a.filter((_, j) => j !== i))}
                        aria-label="Remover este produto da nota"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLinhas((a) => [...a, { ...LINHA_VAZIA }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar produto
              </Button>
            </div>

            {totalPrevisto > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4" />
                  Total da nota
                </span>
                <span className="font-semibold">{deCentavos(totalPrevisto)}</span>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={salvando}>
              {salvando ? "Lançando…" : "Lançar entrada"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

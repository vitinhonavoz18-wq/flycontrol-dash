import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Minus, Package, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/billing/money";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { paraCentavos, qtd } from "@/lib/inventory/formato";
import {
  buscarProdutosParaVenda,
  finalizarVendaNoBalcao,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/pos")({ component: VendaNoBalcao });

type Achado = Awaited<ReturnType<typeof buscarProdutosParaVenda>>[number];
type ItemDoCarrinho = Achado & { quantidade: number };
type BuscaPendente = {
  termo: string;
  timer: ReturnType<typeof setTimeout> | null;
  adicionarAoReceber: boolean;
};

const PAGAMENTOS = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "debito", rotulo: "Cartão de débito" },
  { valor: "credito", rotulo: "Cartão de crédito" },
  { valor: "outro", rotulo: "Outro" },
];

function VendaNoBalcao() {
  const { tenantId } = useLojaDoEstoque();
  return <Caixa key={tenantId} tenantId={tenantId} />;
}

function produtoSugerido(produtos: Achado[], termo: string) {
  const chave = termo.toLowerCase();
  const codigo = produtos.filter(
    (p) => p.sku?.toLowerCase() === chave || p.internal_code?.toLowerCase() === chave,
  );
  const barras = produtos.find((p) => p.barcode === termo);
  if (barras) return barras;
  if (codigo.length) return codigo.length === 1 ? codigo[0] : undefined;

  const nomes = produtos.filter((p) => p.name.toLowerCase() === chave);
  if (nomes.length === 1) return nomes[0];
  return produtos.length === 1 ? produtos[0] : undefined;
}

function Caixa({ tenantId }: { tenantId: string }) {
  const buscar = useServerFn(buscarProdutosParaVenda);
  const finalizar = useServerFn(finalizarVendaNoBalcao);

  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<Achado[] | "erro" | null>(null);
  const [indiceEscolhido, setIndiceEscolhido] = useState<number | null>(null);
  const [carrinho, setCarrinho] = useState<ItemDoCarrinho[]>([]);
  const [pagamento, setPagamento] = useState("dinheiro");
  const [desconto, setDesconto] = useState("");
  const [acrescimo, setAcrescimo] = useState("");
  const [cliente, setCliente] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [ultimaVenda, setUltimaVenda] = useState<{ numero: number; total: number } | null>(null);

  const campoBusca = useRef<HTMLInputElement>(null);
  const buscaAtual = useRef<BuscaPendente | null>(null);
  const vendaEmEnvio = useRef(false);
  const listaId = useId();
  const ajudaId = useId();

  const textoBusca = termo.trim();
  const achados = Array.isArray(resultado) ? resultado : [];
  const buscando = !!textoBusca && !!tenantId && resultado === null;
  const sugerido = produtoSugerido(achados, textoBusca);
  const indiceAtivo = indiceEscolhido ?? achados.findIndex((p) => p.id === sugerido?.id);
  const produtoAtivo = achados[indiceAtivo];

  const cancelarBusca = useCallback(() => {
    const timer = buscaAtual.current?.timer;
    if (timer != null) clearTimeout(timer);
    buscaAtual.current = null;
  }, []);

  useEffect(() => cancelarBusca, [cancelarBusca]);

  function limparBusca() {
    cancelarBusca();
    setTermo("");
    setResultado(null);
    setIndiceEscolhido(null);
  }

  function adicionar(p: Achado, focarBusca = true) {
    if (vendaEmEnvio.current) return;
    setCarrinho((atual) => {
      const existente = atual.find((i) => i.id === p.id);
      if (existente) {
        return atual.map((i) => (i.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [...atual, { ...p, quantidade: 1 }];
    });
    limparBusca();
    if (focarBusca) campoBusca.current?.focus();
  }

  async function executarBusca(busca: BuscaPendente) {
    if (busca.timer !== null) clearTimeout(busca.timer);
    busca.timer = null;
    try {
      const produtos = await buscar({ data: { tenantId, termo: busca.termo } });
      if (buscaAtual.current !== busca) return;

      const produto = busca.adicionarAoReceber && produtoSugerido(produtos, busca.termo);
      if (produto && !vendaEmEnvio.current) adicionar(produto, false);
      else setResultado(produtos);
    } catch {
      if (buscaAtual.current === busca) setResultado("erro");
    }
  }

  function alterarTermo(valor: string) {
    cancelarBusca();
    setTermo(valor);
    setResultado(null);
    setIndiceEscolhido(null);

    const termo = valor.trim();
    if (!termo || !tenantId) return;
    const busca: BuscaPendente = { termo, timer: null, adicionarAoReceber: false };
    busca.timer = setTimeout(() => void executarBusca(busca), 250);
    buscaAtual.current = busca;
  }

  function handleTeclaBusca(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.repeat || vendaEmEnvio.current) return;

      if (!textoBusca) {
        void handleFinalizar();
      } else if (produtoAtivo) {
        adicionar(produtoAtivo);
      } else if (buscaAtual.current && (buscando || resultado === "erro")) {
        const busca = buscaAtual.current;
        busca.adicionarAoReceber = true;
        if (busca.timer !== null || resultado === "erro") {
          setResultado(null);
          void executarBusca(busca);
        }
      }
      return;
    }

    if (e.key === "Escape" && textoBusca && !vendaEmEnvio.current) {
      e.preventDefault();
      limparBusca();
      return;
    }

    if (!achados.length || vendaEmEnvio.current) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const proximo =
        e.key === "ArrowDown"
          ? Math.min(indiceAtivo + 1, achados.length - 1)
          : indiceAtivo < 0
            ? achados.length - 1
            : Math.max(indiceAtivo - 1, 0);
      setIndiceEscolhido(proximo);
      document
        .getElementById(`${listaId}-${achados[proximo].id}`)
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }

  function mudarQuantidade(id: string, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((i) => (i.id === id ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    );
  }

  const subtotalCents = carrinho.reduce((s, i) => s + i.price_cents * i.quantidade, 0);
  const descontoCents = paraCentavos(desconto || "0") ?? 0;
  const acrescimoCents = paraCentavos(acrescimo || "0") ?? 0;
  const totalCents = Math.max(subtotalCents - descontoCents + acrescimoCents, 0);

  async function handleFinalizar() {
    if (!tenantId || !carrinho.length || vendaEmEnvio.current) return;
    vendaEmEnvio.current = true;
    setFinalizando(true);
    try {
      // O preço NÃO vai daqui. O servidor busca na ficha de cada produto —
      // senão bastaria alterar o que o navegador envia para levar uma caixa de
      // cerveja por um centavo.
      const r = await finalizar({
        data: {
          tenantId,
          itens: carrinho.map((i) => ({ productId: i.id, quantity: i.quantidade })),
          paymentMethod: pagamento,
          discountCents: descontoCents,
          surchargeCents: acrescimoCents,
          customerName: cliente || null,
        },
      });
      setUltimaVenda({ numero: r.sale_number, total: r.total_cents });
      limparBusca();
      setCarrinho([]);
      setDesconto("");
      setAcrescimo("");
      setCliente("");
      toast.success(`Venda #${r.sale_number} concluída — ${formatCents(r.total_cents)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui finalizar a venda.");
    } finally {
      vendaEmEnvio.current = false;
      setFinalizando(false);
      campoBusca.current?.focus();
    }
  }

  let ajudaBusca = "Digite o nome ou o código do produto e pressione Enter para adicionar.";
  if (!tenantId) ajudaBusca = "Selecione uma loja para iniciar a venda.";
  else if (finalizando) ajudaBusca = "Finalizando a venda…";
  else if (buscando) ajudaBusca = "Buscando produtos…";
  else if (resultado === "erro")
    ajudaBusca = "Falha na busca. Pressione Enter para tentar novamente.";
  else if (resultado?.length === 0) ajudaBusca = "Nenhum produto encontrado.";
  else if (achados.length > 0) {
    ajudaBusca = produtoAtivo
      ? "Pressione Enter para adicionar o produto selecionado."
      : "Use ↑ e ↓ para escolher um produto e Enter para adicionar.";
    if (produtoAtivo && achados.length > 1) ajudaBusca += " Use ↑ e ↓ para escolher outro.";
  } else if (carrinho.length > 0 && !textoBusca) {
    ajudaBusca = "Digite outro produto ou pressione Enter para finalizar a venda.";
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* -------------------- Busca e resultados -------------------- */}
      <div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={campoBusca}
            value={termo}
            onChange={(e) => alterarTermo(e.target.value)}
            onKeyDown={handleTeclaBusca}
            placeholder="Buscar produto ou passar o código de barras"
            className="h-14 pl-11 pr-9 text-base"
            aria-label="Buscar produto para vender"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={achados.length > 0}
            aria-controls={achados.length > 0 ? listaId : undefined}
            aria-activedescendant={produtoAtivo ? `${listaId}-${produtoAtivo.id}` : undefined}
            aria-describedby={ajudaId}
            autoComplete="off"
            disabled={!tenantId}
            readOnly={finalizando}
            autoFocus
          />
          {buscando && (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        <p id={ajudaId} role="status" className="mt-2 text-sm text-muted-foreground">
          {ajudaBusca}
        </p>

        {achados.length > 0 && (
          <div
            id={listaId}
            role="listbox"
            aria-label="Produtos encontrados"
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            {achados.map((p) => {
              const semEstoque = p.stock_base <= 0;
              const selecionado = p.id === produtoAtivo?.id;
              const codigo = p.sku || p.internal_code || p.barcode;
              return (
                <button
                  key={p.id}
                  id={`${listaId}-${p.id}`}
                  type="button"
                  role="option"
                  aria-selected={selecionado}
                  tabIndex={-1}
                  disabled={finalizando}
                  onClick={() => adicionar(p)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                    selecionado ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground/40" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">{p.name}</p>
                    {codigo && <p className="truncate text-xs text-muted-foreground">{codigo}</p>}
                    <p className="text-sm text-muted-foreground">
                      {formatCents(p.price_cents)} ·{" "}
                      <span className={semEstoque ? "font-bold text-rose-600" : ""}>
                        {semEstoque ? "sem estoque" : `${qtd(p.stock_base)} ${p.base_unit}`}
                      </span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {ultimaVenda && !carrinho.length && (
          <div
            role="status"
            className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-400"
          >
            <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">
              Venda <strong>#{ultimaVenda.numero}</strong> concluída —{" "}
              <strong>{formatCents(ultimaVenda.total)}</strong>. O estoque já foi baixado.
            </p>
          </div>
        )}
      </div>

      {/* -------------------- O carrinho -------------------- */}
      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Carrinho
            {carrinho.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {carrinho.length} {carrinho.length === 1 ? "item" : "itens"}
              </Badge>
            )}
          </h2>

          {carrinho.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item ainda.</p>
          ) : (
            <fieldset disabled={finalizando} className="min-w-0 space-y-3">
              <div className="max-h-[40dvh] space-y-2 overflow-y-auto">
                {carrinho.map((i) => (
                  <div key={i.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-label={`Remover ${i.name}`}
                        onClick={() => setCarrinho((a) => a.filter((x) => x.id !== i.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          aria-label="Diminuir"
                          onClick={() => mudarQuantidade(i.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-bold tabular-nums">
                          {i.quantidade}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          aria-label="Aumentar"
                          onClick={() => mudarQuantidade(i.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-bold tabular-nums">
                        {formatCents(i.price_cents * i.quantidade)}
                      </span>
                    </div>
                    {i.quantidade > i.stock_base && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                        Só há {qtd(i.stock_base)} em estoque.
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="v-desc" className="text-xs">
                    Desconto (R$)
                  </Label>
                  <Input
                    id="v-desc"
                    value={desconto}
                    onChange={(e) => setDesconto(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="v-acre" className="text-xs">
                    Acréscimo (R$)
                  </Label>
                  <Input
                    id="v-acre"
                    value={acrescimo}
                    onChange={(e) => setAcrescimo(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="v-pag" className="text-xs">
                  Forma de pagamento
                </Label>
                <Select value={pagamento} onValueChange={setPagamento} disabled={finalizando}>
                  <SelectTrigger id="v-pag" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGAMENTOS.map((p) => (
                      <SelectItem key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="v-cliente" className="text-xs">
                  Cliente (opcional)
                </Label>
                <Input
                  id="v-cliente"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <Linha rotulo="Subtotal" valor={formatCents(subtotalCents)} />
                {descontoCents > 0 && (
                  <Linha rotulo="Desconto" valor={`− ${formatCents(descontoCents)}`} />
                )}
                {acrescimoCents > 0 && (
                  <Linha rotulo="Acréscimo" valor={`+ ${formatCents(acrescimoCents)}`} />
                )}
                <div className="flex justify-between pt-1 text-lg font-black">
                  <span>Total</span>
                  <span className="tabular-nums text-primary">{formatCents(totalCents)}</span>
                </div>
              </div>

              <Button
                className="h-12 w-full gap-2 text-base"
                onClick={handleFinalizar}
                aria-keyshortcuts={!textoBusca ? "Enter" : undefined}
              >
                {finalizando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {finalizando ? "Finalizando…" : "Finalizar venda"}
              </Button>
            </fieldset>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

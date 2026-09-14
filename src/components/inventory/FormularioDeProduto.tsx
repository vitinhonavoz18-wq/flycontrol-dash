import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/ui/image-upload";
import { formatCents } from "@/lib/billing/money";
import {
  deCentavos,
  formatarPercentual,
  lerNumero,
  margemPercentual,
  paraCentavos,
  qtd,
} from "@/lib/inventory/formato";
import {
  excluirConversaoDeEmbalagem,
  lerProdutoDeEstoque,
  salvarConversaoDeEmbalagem,
  salvarProdutoDeEstoque,
} from "@/lib/inventory/inventory.functions";

/**
 * O cadastro do produto de estoque.
 *
 * O SALDO NÃO ESTÁ AQUI, E ISSO É DE PROPÓSITO.
 *
 * Corrigir a ficha do produto é uma coisa; mexer na quantidade é outra, e essa
 * só acontece por movimentação registrada (o botão "Entrada / Saída"). Se este
 * formulário pudesse gravar "estoque = 30", o extrato deixaria de explicar o
 * saldo no primeiro dia de uso — como um caixa em que o gerente pode digitar o
 * total direto, sem passar pelas notas.
 */

const UNIDADES = [
  "unidade",
  "pacote",
  "caixa",
  "fardo",
  "kg",
  "grama",
  "litro",
  "mililitro",
  "dúzia",
  "saco",
  "galão",
];

export function FormularioDeProduto({
  tenantId,
  produtoId,
  categorias,
  onFechar,
  onSalvo,
}: {
  tenantId: string;
  produtoId?: string;
  categorias: Array<{ id: string; name: string }>;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const ler = useServerFn(lerProdutoDeEstoque);
  const salvar = useServerFn(salvarProdutoDeEstoque);
  const salvarConversao = useServerFn(salvarConversaoDeEmbalagem);
  const excluirConversao = useServerFn(excluirConversaoDeEmbalagem);

  const editando = !!produtoId;
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [marca, setMarca] = useState("");
  const [categoriaId, setCategoriaId] = useState("nenhuma");
  const [sku, setSku] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [codigoInterno, setCodigoInterno] = useState("");
  const [imagem, setImagem] = useState("");
  const [custo, setCusto] = useState("0,00");
  const [venda, setVenda] = useState("0,00");
  const [unidadeBase, setUnidadeBase] = useState("unidade");
  const [minimo, setMinimo] = useState("0");
  const [ideal, setIdeal] = useState("");
  const [permitirNegativo, setPermitirNegativo] = useState(false);
  const [avisarBaixo, setAvisarBaixo] = useState(true);
  const [localizacao, setLocalizacao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saldoAtual, setSaldoAtual] = useState<number | null>(null);

  const [conversoes, setConversoes] = useState<
    Array<{ id: string; unit: string; base_quantity: number }>
  >([]);
  const [novaEmbalagem, setNovaEmbalagem] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState("");

  useEffect(() => {
    if (!produtoId) return;
    let ativoEfeito = true;
    (async () => {
      try {
        const r = await ler({ data: { tenantId, id: produtoId } });
        if (!ativoEfeito) return;
        const p = r.produto;
        setNome(p.name);
        setDescricao(p.description ?? "");
        setMarca(p.brand ?? "");
        setCategoriaId(p.category_id ?? "nenhuma");
        setSku(p.sku ?? "");
        setCodigoBarras(p.barcode ?? "");
        setCodigoInterno(p.internal_code ?? "");
        setImagem(p.image_url ?? "");
        setCusto(deCentavos(p.cost_cents));
        setVenda(deCentavos(p.price_cents));
        setUnidadeBase(p.base_unit);
        setMinimo(qtd(p.min_stock_base));
        setIdeal(p.ideal_stock_base != null ? qtd(p.ideal_stock_base) : "");
        setPermitirNegativo(p.allow_negative_stock);
        setAvisarBaixo(p.low_stock_alert_enabled);
        setLocalizacao(p.location ?? "");
        setAtivo(p.active);
        setSaldoAtual(Number(p.stock_base));
        setConversoes(r.conversoes);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não consegui abrir o produto.");
        onFechar();
      } finally {
        if (ativoEfeito) setCarregando(false);
      }
    })();
    return () => {
      ativoEfeito = false;
    };
  }, [produtoId, tenantId, ler, onFechar]);

  const custoCents = paraCentavos(custo) ?? 0;
  const vendaCents = paraCentavos(venda) ?? 0;
  const lucroCents = vendaCents - custoCents;
  const margem = margemPercentual(custoCents, vendaCents);

  async function handleSalvar() {
    if (!nome.trim()) {
      toast.error("O produto precisa de um nome.");
      return;
    }
    setSalvando(true);
    try {
      const r = await salvar({
        data: {
          tenantId,
          id: produtoId,
          name: nome,
          description: descricao || null,
          brand: marca || null,
          categoryId: categoriaId === "nenhuma" ? null : categoriaId,
          sku: sku || null,
          barcode: codigoBarras || null,
          internalCode: codigoInterno || null,
          imageUrl: imagem || null,
          costCents: custoCents,
          priceCents: vendaCents,
          baseUnit: unidadeBase,
          minStockBase: lerNumero(minimo) ?? 0,
          idealStockBase: ideal ? lerNumero(ideal) : null,
          allowNegativeStock: permitirNegativo,
          lowStockAlertEnabled: avisarBaixo,
          location: localizacao || null,
          active: ativo,
        },
      });
      toast.success(editando ? "Produto atualizado." : "Produto cadastrado.");
      if (!editando && r?.id) {
        // Produto novo: a janela continua aberta para o dono já cadastrar as
        // embalagens, que é justamente o que faltaria para ele conseguir dar
        // entrada em "10 caixas" logo em seguida.
        onSalvo();
        return;
      }
      onSalvo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleAdicionarEmbalagem() {
    const quantidade = lerNumero(novaQuantidade);
    if (!novaEmbalagem.trim()) {
      toast.error("Dê um nome à embalagem (caixa, fardo, pacote…).");
      return;
    }
    if (!quantidade || quantidade <= 0) {
      toast.error("Diga quantas unidades cabem nessa embalagem.");
      return;
    }
    if (!produtoId) return;
    try {
      await salvarConversao({
        data: {
          tenantId,
          productId: produtoId,
          unit: novaEmbalagem.trim(),
          baseQuantity: quantidade,
        },
      });
      const r = await ler({ data: { tenantId, id: produtoId } });
      setConversoes(r.conversoes);
      setNovaEmbalagem("");
      setNovaQuantidade("");
      toast.success("Embalagem cadastrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui cadastrar.");
    }
  }

  async function handleRemoverEmbalagem(id: string) {
    try {
      await excluirConversao({ data: { tenantId, id } });
      setConversoes((c) => c.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui remover.");
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-5">
            <Secao titulo="Informações básicas">
              <div className="space-y-2">
                <Label htmlFor="p-nome">Nome do produto *</Label>
                <Input
                  id="p-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Coca-Cola lata 350ml"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-categoria">Categoria</Label>
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger id="p-categoria">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Sem categoria</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-marca">Marca</Label>
                  <Input id="p-marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="p-desc">Descrição</Label>
                <Textarea
                  id="p-desc"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="p-sku">SKU</Label>
                  <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-barras">Código de barras</Label>
                  <Input
                    id="p-barras"
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-interno">Código interno</Label>
                  <Input
                    id="p-interno"
                    value={codigoInterno}
                    onChange={(e) => setCodigoInterno(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Foto do produto</Label>
                <ImageUpload
                  value={imagem}
                  onChange={(url: string | null) => setImagem(url ?? "")}
                />
              </div>
            </Secao>

            <Secao titulo="Preços">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-custo">Preço de custo (R$)</Label>
                  <Input
                    id="p-custo"
                    value={custo}
                    onChange={(e) => setCusto(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-venda">Preço de venda (R$)</Label>
                  <Input
                    id="p-venda"
                    value={venda}
                    onChange={(e) => setVenda(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* A conta aparece sozinha, atualizada enquanto o dono digita. */}
              <div className="flex flex-wrap gap-4 rounded-lg bg-muted/50 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Lucro por unidade</p>
                  <p
                    className={`font-bold tabular-nums ${lucroCents < 0 ? "text-destructive" : ""}`}
                  >
                    {formatCents(lucroCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Margem</p>
                  <p
                    className={`font-bold tabular-nums ${lucroCents < 0 ? "text-destructive" : ""}`}
                  >
                    {formatarPercentual(margem)}
                  </p>
                </div>
                {lucroCents < 0 && (
                  <p className="w-full text-xs text-destructive">
                    O preço de venda está abaixo do custo — cada venda dá prejuízo.
                  </p>
                )}
              </div>
            </Secao>

            <Secao titulo="Controle de estoque">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="p-unidade">Unidade de controle</Label>
                  <Select value={unidadeBase} onValueChange={setUnidadeBase} disabled={editando}>
                    <SelectTrigger id="p-unidade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editando && (
                    // Trocar a unidade base depois faria o saldo mudar de
                    // significado sem nenhuma movimentação: 48 "unidades"
                    // viraria 48 "caixas" da noite para o dia.
                    <p className="text-[10px] text-muted-foreground">
                      Não muda depois de criado — o saldo já está contado nesta unidade.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-minimo">Estoque mínimo</Label>
                  <Input
                    id="p-minimo"
                    value={minimo}
                    onChange={(e) => setMinimo(e.target.value)}
                    inputMode="decimal"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Ao chegar aqui, o produto entra no aviso de estoque baixo.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-ideal">Estoque ideal</Label>
                  <Input
                    id="p-ideal"
                    value={ideal}
                    onChange={(e) => setIdeal(e.target.value)}
                    inputMode="decimal"
                    placeholder="opcional"
                  />
                </div>
              </div>

              {editando && saldoAtual !== null && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <span className="text-muted-foreground">Saldo atual: </span>
                  <strong className="tabular-nums">
                    {qtd(saldoAtual)} {unidadeBase}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O saldo não se edita aqui. Ele muda por entrada, saída ou ajuste — assim o
                    histórico sempre explica de onde veio o número.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="p-local">Localização (corredor, prateleira)</Label>
                <Input
                  id="p-local"
                  value={localizacao}
                  onChange={(e) => setLocalizacao(e.target.value)}
                  placeholder="Ex: Corredor 3, prateleira B"
                />
              </div>

              <div className="space-y-3">
                <Interruptor
                  id="p-avisar"
                  ligado={avisarBaixo}
                  onMudar={setAvisarBaixo}
                  titulo="Avisar quando o estoque ficar baixo"
                  detalhe="O aviso aparece uma vez, quando o saldo cruza o mínimo — não a cada venda."
                />
                <Interruptor
                  id="p-negativo"
                  ligado={permitirNegativo}
                  onMudar={setPermitirNegativo}
                  titulo="Permitir vender sem estoque"
                  detalhe="Útil para quem já vendeu o que ainda vai chegar. Com isso desligado, a venda é bloqueada quando não há saldo."
                />
                <Interruptor
                  id="p-ativo"
                  ligado={ativo}
                  onMudar={setAtivo}
                  titulo="Produto ativo"
                  detalhe="Produto inativo não aparece na venda no balcão."
                />
              </div>
            </Secao>

            {editando && (
              <Secao titulo="Embalagens">
                <p className="text-xs text-muted-foreground">
                  Diga quantas unidades cabem em cada embalagem. Assim você dá entrada em &quot;10
                  caixas&quot; e o sistema entende 120 unidades sozinho.
                </p>

                {conversoes.length > 0 && (
                  <div className="space-y-1.5">
                    {conversoes.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <span>
                          1 <strong>{c.unit}</strong> = {qtd(c.base_quantity)} {unidadeBase}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Remover embalagem ${c.unit}`}
                          onClick={() => handleRemoverEmbalagem(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[120px] flex-1 space-y-1">
                    <Label htmlFor="e-nome" className="text-xs">
                      Embalagem
                    </Label>
                    <Input
                      id="e-nome"
                      value={novaEmbalagem}
                      onChange={(e) => setNovaEmbalagem(e.target.value)}
                      placeholder="caixa"
                    />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label htmlFor="e-qtd" className="text-xs">
                      Tem quantas {unidadeBase}?
                    </Label>
                    <Input
                      id="e-qtd"
                      value={novaQuantidade}
                      onChange={(e) => setNovaQuantidade(e.target.value)}
                      inputMode="decimal"
                      placeholder="12"
                    />
                  </div>
                  <Button variant="outline" onClick={handleAdicionarEmbalagem} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
              </Secao>
            )}

            {!editando && (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Depois de salvar você poderá cadastrar as embalagens (caixa, fardo) e dar a primeira
                entrada de mercadoria.
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={onFechar} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} disabled={salvando} className="gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {editando ? "Salvar alterações" : "Cadastrar produto"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Interruptor({
  id,
  ligado,
  onMudar,
  titulo,
  detalhe,
}: {
  id: string;
  ligado: boolean;
  onMudar: (v: boolean) => void;
  titulo: string;
  detalhe: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer font-medium">
          {titulo}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>
      </div>
      <Switch id={id} checked={ligado} onCheckedChange={onMudar} />
    </div>
  );
}

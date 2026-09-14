import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lerNumero, qtd } from "@/lib/inventory/formato";
import { lerProdutoDeEstoque, registrarMovimentacao } from "@/lib/inventory/inventory.functions";

/**
 * Registrar entrada, saída ou ajuste de um produto.
 *
 * Esta é a ÚNICA porta pela qual o saldo muda na mão. E ela sempre pede um
 * motivo — porque daqui a um mês, quando o dono olhar o extrato e vir "-12",
 * a pergunta vai ser "por quê?", e "porque alguém digitou" não é resposta.
 */

const MOTIVOS_ENTRADA = [
  { valor: "compra_fornecedor", rotulo: "Compra de fornecedor" },
  { valor: "reposicao", rotulo: "Reposição" },
  { valor: "devolucao_cliente", rotulo: "Devolução de cliente" },
  { valor: "ajuste_positivo", rotulo: "Ajuste (sobrou)" },
  { valor: "outra_entrada", rotulo: "Outra entrada" },
];

const MOTIVOS_SAIDA = [
  { valor: "venda_balcao", rotulo: "Venda no balcão" },
  { valor: "perda", rotulo: "Perda" },
  { valor: "vencido", rotulo: "Produto vencido" },
  { valor: "danificado", rotulo: "Produto danificado" },
  { valor: "uso_interno", rotulo: "Uso interno" },
  { valor: "ajuste_negativo", rotulo: "Ajuste (faltou)" },
  { valor: "outra_saida", rotulo: "Outra saída" },
];

export function DialogoDeMovimentacao({
  tenantId,
  produto,
  onFechar,
  onRegistrado,
}: {
  tenantId: string;
  produto: { id: string; name: string; base_unit: string; stock_base: number };
  onFechar: () => void;
  onRegistrado: () => void;
}) {
  const registrar = useServerFn(registrarMovimentacao);
  const ler = useServerFn(lerProdutoDeEstoque);

  const [motivo, setMotivo] = useState("compra_fornecedor");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState(produto.base_unit);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [embalagens, setEmbalagens] = useState<Array<{ unit: string; base_quantity: number }>>([]);

  const entrada = MOTIVOS_ENTRADA.some((m) => m.valor === motivo);
  const direcao: "in" | "out" = entrada ? "in" : "out";

  useEffect(() => {
    let ativo = true;
    ler({ data: { tenantId, id: produto.id } })
      .then((r) => ativo && setEmbalagens(r.conversoes))
      .catch(() => ativo && setEmbalagens([]));
    return () => {
      ativo = false;
    };
  }, [tenantId, produto.id, ler]);

  // Quanto isso vira na unidade de controle. Mostrar antes de confirmar evita
  // a surpresa de dar entrada em 10 caixas e ver o saldo subir 10.
  const fator =
    unidade === produto.base_unit
      ? 1
      : (embalagens.find((e) => e.unit === unidade)?.base_quantity ?? 1);
  const digitado = lerNumero(quantidade) ?? 0;
  const emUnidadeBase = digitado * fator;
  const saldoDepois = produto.stock_base + (entrada ? emUnidadeBase : -emUnidadeBase);

  async function handleRegistrar() {
    const q = lerNumero(quantidade);
    if (!q || q <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      const r = await registrar({
        data: {
          tenantId,
          productId: produto.id,
          direction: direcao,
          reason: motivo,
          quantity: q,
          unit: unidade,
          notes: observacao || null,
        },
      });
      toast.success(
        `${entrada ? "Entrada" : "Saída"} registrada. Saldo agora: ${qtd(r.stock_after)} ${produto.base_unit}.`,
      );
      if (r.low_stock_crossed) {
        toast.warning(`${produto.name} atingiu o estoque mínimo.`);
      }
      onRegistrado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="font-bold">{produto.name}</p>
            <p className="text-sm text-muted-foreground">
              Saldo atual:{" "}
              <strong className="tabular-nums text-foreground">
                {qtd(produto.stock_base)} {produto.base_unit}
              </strong>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-motivo">O que aconteceu?</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger id="m-motivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Entrou mercadoria</SelectLabel>
                  {MOTIVOS_ENTRADA.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Saiu mercadoria</SelectLabel>
                  {MOTIVOS_SAIDA.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="m-qtd">Quantidade</Label>
              <Input
                id="m-qtd"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-unidade">Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger id="m-unidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={produto.base_unit}>{produto.base_unit}</SelectItem>
                  {embalagens.map((e) => (
                    <SelectItem key={e.unit} value={e.unit}>
                      {e.unit} ({qtd(e.base_quantity)} {produto.base_unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {digitado > 0 && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                saldoDepois < 0
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                  : "border-border bg-muted/30"
              }`}
            >
              {unidade !== produto.base_unit && (
                <p className="text-xs text-muted-foreground">
                  {qtd(digitado)} {unidade} ={" "}
                  <strong>
                    {qtd(emUnidadeBase)} {produto.base_unit}
                  </strong>
                </p>
              )}
              <p className="mt-0.5">
                Saldo depois:{" "}
                <strong className="tabular-nums">
                  {qtd(saldoDepois)} {produto.base_unit}
                </strong>
              </p>
              {saldoDepois < 0 && (
                <p className="mt-1 text-xs">
                  Isso deixaria o saldo negativo. Se o produto não permitir venda a descoberto, a
                  operação será recusada.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="m-obs">Observação</Label>
            <Textarea
              id="m-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="opcional — ex: nota fiscal 1234"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleRegistrar} disabled={salvando} className="gap-2">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar {entrada ? "entrada" : "saída"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Loader2, ReceiptText, X, Truck, ChefHat, PackageCheck, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROTULO_PAINEL, situacaoValida, podeSerAlteradoPelaIa } from "@/lib/crm/pedidoStatus";
import type { PedidoDoChat } from "@/lib/crm/crm.functions";

/**
 * O PEDIDO QUE A IA FEZ, dentro da conversa.
 *
 * Ele já está na lista de Pedidos — este cartão não é para aprovar, é para o
 * lojista ver o que foi vendido sem sair da conversa. É a comanda pregada ao
 * lado do telefone, não guardada numa gaveta em outra sala.
 *
 * O BOTÃO DE CANCELAR É A REDE. Como ninguém confere antes, ele é a única
 * chance de desfazer um mal-entendido da IA — e some assim que a cozinha
 * começa, porque a partir dali cancelar na tela sem avisar ninguém faria a
 * comida sair do mesmo jeito, sem pedido para cobrar.
 */

function emReais(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CORES: Record<string, string> = {
  novo: "border-primary bg-primary/10",
  preparando: "border-amber-500 bg-amber-500/10",
  saiu: "border-sky-600 bg-sky-600/10",
  entregue: "border-emerald-600 bg-emerald-600/10",
  cancelado: "border-muted-foreground/40 bg-muted",
};

function Icone({ situacao }: { situacao: string }) {
  const c = "h-4 w-4 shrink-0";
  if (situacao === "preparando") return <ChefHat className={c} aria-hidden="true" />;
  if (situacao === "saiu") return <Truck className={c} aria-hidden="true" />;
  if (situacao === "entregue") return <PackageCheck className={c} aria-hidden="true" />;
  if (situacao === "cancelado") return <Ban className={c} aria-hidden="true" />;
  return <ReceiptText className={c} aria-hidden="true" />;
}

export function CartaoPedido({
  pedido,
  onCancelar,
}: {
  pedido: PedidoDoChat;
  onCancelar: () => Promise<void>;
}) {
  const [cancelando, setCancelando] = useState(false);

  const situacao = situacaoValida(pedido.status) ?? "novo";
  const podeCancelar = podeSerAlteradoPelaIa(pedido.status);

  async function cancelar() {
    if (cancelando) return;
    setCancelando(true);
    try {
      await onCancelar();
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className={`shrink-0 border-t-2 px-3 py-2.5 ${CORES[situacao] ?? CORES.novo}`}>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Icone situacao={situacao} />
            Pedido {pedido.numero ? `#${pedido.numero}` : ""} — feito pela atendente
          </p>
          <span className="rounded-full border-2 border-current px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            {ROTULO_PAINEL[situacao]}
          </span>
        </div>

        <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
          {pedido.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="font-semibold">{i.quantity ?? 1}x</span> {i.name ?? "item"}
                {i.notes ? <span className="text-muted-foreground"> — {i.notes}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">{emReais(Number(i.total_price ?? 0))}</span>
            </li>
          ))}
        </ul>

        {pedido.delivery_fee > 0 && (
          <div className="mt-0.5 flex justify-between gap-3 text-sm text-muted-foreground">
            <span>Entrega{pedido.neighborhood ? ` (${pedido.neighborhood})` : ""}</span>
            <span className="tabular-nums">{emReais(pedido.delivery_fee)}</span>
          </div>
        )}

        <div className="mt-1 flex justify-between gap-3 border-t border-current/30 pt-1 text-base font-bold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{emReais(pedido.total)}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {pedido.payment_method && (
            <span>
              <span className="font-semibold text-foreground">Pagamento:</span>{" "}
              {pedido.payment_method}
            </span>
          )}
          {pedido.customer_address && (
            <span className="min-w-0 truncate">
              <span className="font-semibold text-foreground">Entrega:</span>{" "}
              {pedido.customer_address}
            </span>
          )}
        </div>

        {/* A observação carrega o que o cliente pediu e a loja não tem. Some daí
            a próxima compra do estoque — por isso fica em destaque. */}
        {pedido.notes && (
          <p className="mt-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
            {pedido.notes}
          </p>
        )}

        {podeCancelar && (
          <Button
            variant="outline"
            className="mt-2 h-9 w-full border-2 font-semibold"
            onClick={() => void cancelar()}
            disabled={cancelando}
          >
            {cancelando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Cancelar este pedido
          </Button>
        )}
      </div>
    </div>
  );
}

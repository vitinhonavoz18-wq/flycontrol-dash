import { useState } from "react";
import { Loader2, ReceiptText, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RascunhoPedido } from "@/lib/crm/crm.functions";

/**
 * O PEDIDO QUE A IA MONTOU, ESPERANDO VOCÊ.
 *
 * Fica colado acima da caixa de escrever, dentro da conversa — e não numa
 * outra tela. Quem precisa decidir está lendo a conversa naquele instante;
 * mandá-lo procurar o pedido em outro canto do painel é o tipo de detalhe que
 * faz o cliente esperar dez minutos por um "confirmado".
 *
 * É a comanda que o garçom repete em voz alta antes de mandar para a chapa:
 * se a IA entendeu "sem cebola" como "com cebola", o erro morre aqui.
 *
 * O QUE A IA NÃO ACHOU NO CARDÁPIO APARECE EM DESTAQUE, em vez de sumir.
 * "Ele pediu coca zero e a gente não tem" é informação — some daí a próxima
 * compra do estoque.
 */

function emReais(cents: number): string {
  return (Math.round(Number(cents) || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CartaoRascunho({
  rascunho,
  onDecidir,
}: {
  rascunho: RascunhoPedido;
  onDecidir: (decisao: "confirmar" | "recusar") => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<"confirmar" | "recusar" | null>(null);

  async function decidir(decisao: "confirmar" | "recusar") {
    if (ocupado) return;
    setOcupado(decisao);
    try {
      await onDecidir(decisao);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="shrink-0 border-t-2 border-amber-500 bg-amber-50 px-3 py-3 dark:bg-amber-950/40">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <ReceiptText
            className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
            A atendente montou um pedido — confira antes de mandar para a cozinha
          </p>
        </div>

        <ul className="mt-2 space-y-0.5 text-sm text-foreground">
          {rascunho.itens.map((i, n) => (
            <li key={`${i.menu_product_id}-${n}`} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="font-semibold">{i.quantidade}x</span> {i.nome}
                {i.observacao && <span className="text-muted-foreground"> — {i.observacao}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{emReais(i.total_cents)}</span>
            </li>
          ))}
        </ul>

        {rascunho.taxa_entrega_cents > 0 && (
          <div className="mt-1 flex justify-between gap-3 text-sm text-muted-foreground">
            <span>Entrega{rascunho.bairro ? ` (${rascunho.bairro})` : ""}</span>
            <span className="tabular-nums">{emReais(rascunho.taxa_entrega_cents)}</span>
          </div>
        )}

        <div className="mt-1.5 flex justify-between gap-3 border-t border-amber-500/40 pt-1.5 text-base font-bold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{emReais(rascunho.total_cents)}</span>
        </div>

        {(rascunho.endereco || rascunho.forma_pagamento || rascunho.observacoes) && (
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {rascunho.endereco && (
              <p>
                <span className="font-semibold text-foreground">Entrega:</span> {rascunho.endereco}
              </p>
            )}
            {rascunho.forma_pagamento && (
              <p>
                <span className="font-semibold text-foreground">Pagamento:</span>{" "}
                {rascunho.forma_pagamento}
              </p>
            )}
            {rascunho.observacoes && (
              <p>
                <span className="font-semibold text-foreground">Observação:</span>{" "}
                {rascunho.observacoes}
              </p>
            )}
          </div>
        )}

        {rascunho.nao_encontrados.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              O cliente pediu e não temos no cardápio: {rascunho.nao_encontrados.join(", ")}.
            </span>
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            className="h-10 flex-1 font-bold shadow-sm"
            onClick={() => void decidir("confirmar")}
            disabled={ocupado !== null}
          >
            {ocupado === "confirmar" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Confirmar pedido
          </Button>
          <Button
            variant="outline"
            className="h-10 border-2 font-semibold"
            onClick={() => void decidir("recusar")}
            disabled={ocupado !== null}
          >
            {ocupado === "recusar" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Descartar
          </Button>
        </div>
      </div>
    </div>
  );
}

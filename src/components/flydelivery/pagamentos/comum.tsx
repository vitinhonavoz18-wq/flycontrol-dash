/**
 * Peças pequenas repetidas nas duas telas financeiras do Pix (loja e admin).
 */

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { rotuloDaConta, rotuloDoPagamento } from "@/lib/flydelivery/pagamentos/resumo";

const COR_DO_PAGAMENTO: Record<string, string> = {
  pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  criando: "bg-amber-50 text-amber-700 border-amber-200",
  incerto: "bg-orange-50 text-orange-700 border-orange-200",
  falhou: "bg-zinc-100 text-zinc-600 border-zinc-200",
  expirado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  estornado: "bg-red-50 text-red-700 border-red-200",
  em_disputa: "bg-red-50 text-red-700 border-red-200",
  divergente: "bg-red-50 text-red-700 border-red-200",
  duplicado: "bg-red-50 text-red-700 border-red-200",
};

const COR_DA_CONTA: Record<string, string> = {
  ativa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  aguardando_verificacao: "bg-amber-50 text-amber-700 border-amber-200",
  nao_configurada: "bg-zinc-100 text-zinc-600 border-zinc-200",
  recusada: "bg-red-50 text-red-700 border-red-200",
  suspensa: "bg-red-50 text-red-700 border-red-200",
};

export function SeloDoPagamento({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium", COR_DO_PAGAMENTO[status])}
    >
      {rotuloDoPagamento(status)}
    </Badge>
  );
}

export function SeloDaConta({ status }: { status: string | null | undefined }) {
  const s = status ?? "nao_configurada";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", COR_DA_CONTA[s])}>
      {rotuloDaConta(s)}
    </Badge>
  );
}

export function Indicador({
  titulo,
  valor,
  detalhe,
  destaque,
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <Card
      className={cn(
        "border-zinc-200 bg-white shadow-sm",
        destaque && "border-primary/40 ring-1 ring-primary/15",
      )}
    >
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <p className={cn("text-xl font-bold tabular-nums", destaque && "text-primary")}>{valor}</p>
        {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
      </CardContent>
    </Card>
  );
}

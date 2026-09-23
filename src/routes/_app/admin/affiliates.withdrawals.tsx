import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SeletorAdmin } from "@/components/afiliados/admin/PecasAdmin";
import { TabelaDeSaques } from "@/components/afiliados/admin/Tabelas";
import type { SituacaoDoSaque } from "@/lib/afiliados/portal";

export const Route = createFileRoute("/_app/admin/affiliates/withdrawals")({
  component: SaquesAdmin,
});

/**
 * A central de saques. Caminho de cada pedido: Em análise → Aprovado →
 * Pago (ou Recusado). O pagamento em si é feito fora do sistema, no banco;
 * aqui a equipe registra que pagou, com o comprovante.
 */
function SaquesAdmin() {
  const [status, setStatus] = useState<SituacaoDoSaque | "open" | "">("open");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Confira o valor e a chave Pix, faça a transferência no banco e só então marque como pago.
        </p>
        <SeletorAdmin
          rotulo="Filtrar por situação"
          valor={status}
          aoMudar={(v) => setStatus(v as SituacaoDoSaque | "open" | "")}
          className="sm:w-56"
          opcoes={[
            { valor: "open", rotulo: "Pendentes (análise + a pagar)" },
            { valor: "requested", rotulo: "Em análise" },
            { valor: "approved", rotulo: "Aprovados, a pagar" },
            { valor: "paid", rotulo: "Pagos" },
            { valor: "rejected", rotulo: "Recusados" },
            { valor: "", rotulo: "Todos" },
          ]}
        />
      </div>
      <TabelaDeSaques status={status} />
    </div>
  );
}

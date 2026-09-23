import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SeletorAdmin } from "@/components/afiliados/admin/PecasAdmin";
import { TabelaDeComissoes } from "@/components/afiliados/admin/Tabelas";
import { useBuscaComPausa } from "@/components/afiliados/admin/useBuscaComPausa";
import type { SituacaoDaComissao } from "@/lib/afiliados/portal";

export const Route = createFileRoute("/_app/admin/affiliates/commissions")({
  component: ComissoesAdmin,
});

/**
 * Todas as comissões. Não existe botão de apagar: o que dá para fazer é
 * inspecionar (de onde veio o valor) e estornar com motivo — o estorno vira
 * um registro novo, e o original fica no histórico.
 */
function ComissoesAdmin() {
  const [digitado, busca, setDigitado] = useBuscaComPausa();
  const [status, setStatus] = useState<SituacaoDaComissao | "">("");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por afiliado, loja ou número da fatura"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            className="pl-9"
          />
        </div>
        <SeletorAdmin
          rotulo="Filtrar por situação"
          valor={status}
          aoMudar={(v) => setStatus(v as SituacaoDaComissao | "")}
          className="sm:w-52"
          opcoes={[
            { valor: "", rotulo: "Todas" },
            { valor: "pending", rotulo: "Pendente (PENDING)" },
            { valor: "available", rotulo: "Disponível (AVAILABLE)" },
            { valor: "requested", rotulo: "Solicitada (REQUESTED)" },
            { valor: "paid", rotulo: "Paga (PAID)" },
            { valor: "reversed", rotulo: "Estornada (REVERSED)" },
          ]}
        />
      </div>
      <TabelaDeComissoes status={status} busca={busca} />
    </div>
  );
}

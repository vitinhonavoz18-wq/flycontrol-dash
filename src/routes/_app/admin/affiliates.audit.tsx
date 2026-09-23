import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SeletorAdmin } from "@/components/afiliados/admin/PecasAdmin";
import { ListaDeEventos } from "@/components/afiliados/admin/Tabelas";
import { NOME_DO_EVENTO } from "@/lib/afiliados/adminRotulos";

export const Route = createFileRoute("/_app/admin/affiliates/audit")({ component: AuditoriaAdmin });

/**
 * A trilha de auditoria. Ela só cresce: o banco recusa alterar ou apagar
 * qualquer linha daqui, inclusive para a equipe.
 */
function AuditoriaAdmin() {
  const [tipo, setTipo] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Tudo o que aconteceu no programa, com data, afiliado, quem fez e os dados de cada ação.
        </p>
        <SeletorAdmin
          rotulo="Filtrar por evento"
          valor={tipo}
          aoMudar={setTipo}
          className="sm:w-64"
          opcoes={[
            { valor: "", rotulo: "Todos os eventos" },
            { valor: "SUSPICIOUS_ACTIVITY", rotulo: "⚠ Atividade suspeita" },
            ...Object.entries(NOME_DO_EVENTO)
              .filter(([k]) => k !== "SUSPICIOUS_ACTIVITY" && k !== "AFFILIATE_STATUS_CHANGED")
              .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
              .map(([valor, rotulo]) => ({ valor, rotulo })),
          ]}
        />
      </div>
      <ListaDeEventos tipo={tipo} />
    </div>
  );
}

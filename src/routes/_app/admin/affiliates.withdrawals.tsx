import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmarAcao, SeletorAdmin } from "@/components/afiliados/admin/PecasAdmin";
import { TabelaDeSaques } from "@/components/afiliados/admin/Tabelas";
import {
  CHAVE_ADMIN,
  gerarRepassesAgora,
  useResumoAdmin,
  type ResultadoDosRepasses,
} from "@/lib/afiliados/admin";
import type { SituacaoDoSaque } from "@/lib/afiliados/portal";
import {
  dataCurta,
  listaDeDias,
  mensagemDeErro,
  proximoRepasse,
  reais,
} from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/_app/admin/affiliates/withdrawals")({
  component: RepassesAdmin,
});

/**
 * A central de repasses. O parceiro não pede saque: nos dias de repasse
 * (10 e 20), o sistema separa sozinho o saldo de cada um e o repasse
 * aparece aqui. Caminho: Em conferência → Aprovado → Pago (ou Recusado).
 * O Pix em si é feito fora do sistema, no banco; aqui a equipe registra
 * que pagou, com o comprovante.
 */
function RepassesAdmin() {
  const [status, setStatus] = useState<SituacaoDoSaque | "open" | "">("open");
  const [confirmar, setConfirmar] = useState(false);
  const resumo = useResumoAdmin();
  const qc = useQueryClient();
  const dias = resumo.data?.dias_de_repasse;
  const proximo = proximoRepasse(dias);
  const semPix = resumo.data?.com_saldo_sem_pix ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="h-4 w-4 text-primary" />
              Próximo repasse automático:{" "}
              <span data-testid="proximo-repasse-admin">{proximo ? dataCurta(proximo) : "—"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {listaDeDias(dias)
                ? `Todo dia ${listaDeDias(dias)}, às 4h, o sistema separa o saldo disponível de cada afiliado ativo com Pix e saldo acima do mínimo. `
                : ""}
              Depois é com a equipe: conferir, fazer o Pix no banco, avisar o afiliado e marcar como
              pago.
            </p>
            {semPix > 0 ? (
              <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> {semPix}{" "}
                {semPix === 1 ? "afiliado tem" : "afiliados têm"} saldo mas não cadastrou chave Pix
                — fica fora do repasse até cadastrar.{" "}
                <Link to="/admin/affiliates/partners" className="underline">
                  Ver afiliados
                </Link>
              </p>
            ) : null}
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => setConfirmar(true)}>
            Montar repasses de hoje agora
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Confira o valor e a chave Pix, faça a transferência no banco e só então marque como pago.
        </p>
        <SeletorAdmin
          rotulo="Filtrar por situação"
          valor={status}
          aoMudar={(v) => setStatus(v as SituacaoDoSaque | "open" | "")}
          className="sm:w-72"
          opcoes={[
            { valor: "open", rotulo: "Em aberto" },
            { valor: "requested", rotulo: "Em conferência" },
            { valor: "approved", rotulo: "Aprovados, a pagar" },
            { valor: "paid", rotulo: "Pagos" },
            { valor: "rejected", rotulo: "Recusados" },
            { valor: "", rotulo: "Todos" },
          ]}
        />
      </div>
      <TabelaDeSaques status={status} />

      <ConfirmarAcao
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        titulo="Montar repasses de hoje agora"
        rotuloDoBotao="Montar agora"
        descricao={
          <>
            <p>
              Faz agora o que o sistema faz sozinho nos dias de repasse: separa o saldo disponível
              de cada afiliado ativo que tem chave Pix e saldo acima do mínimo.
            </p>
            <p>
              Use quando o repasse automático não rodou. Não duplica: quem já tem repasse hoje, ou
              um repasse anterior ainda não pago, fica de fora.
            </p>
          </>
        }
        aoConfirmar={async () => {
          try {
            const r = await gerarRepassesAgora();
            toast.success(textoDoResultado(r));
            setStatus("open");
            await qc.invalidateQueries({ queryKey: CHAVE_ADMIN });
          } catch (e) {
            toast.error(mensagemDeErro(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

function textoDoResultado(r: ResultadoDosRepasses | null): string {
  if (!r) return "Pronto.";
  const partes = [
    r.repasses === 0
      ? "Nenhum repasse novo"
      : `${r.repasses} ${r.repasses === 1 ? "repasse montado" : "repasses montados"} (${reais(r.valor_cents)})`,
  ];
  if (r.abaixo_do_minimo > 0) partes.push(`${r.abaixo_do_minimo} abaixo do mínimo`);
  if (r.sem_pix > 0) partes.push(`${r.sem_pix} sem Pix`);
  if (r.com_repasse_em_aberto > 0)
    partes.push(`${r.com_repasse_em_aberto} com repasse anterior em aberto`);
  if (r.falhas > 0) partes.push(`${r.falhas} com falha — tente de novo em alguns minutos`);
  return `${partes.join(" · ")}.`;
}

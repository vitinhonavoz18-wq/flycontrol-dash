/**
 * O aviso de "sua fatura chegou".
 *
 * Aparece no painel inteiro a partir do dia em que o mês fecha e a fatura do
 * plano é emitida, com o valor e o botão que abre o pagamento da InfinityPay
 * (Pix ou cartão). Pagou, o ciclo se renova e o aviso some sozinho.
 *
 * Regra de convivência: o lojista pode estar no meio do almoço com a fila
 * cheia. Por isso dá para deixar para depois — mas só até o dia seguinte. É o
 * garçom que traz a conta: se o cliente pede um minuto, ele volta mais tarde,
 * não esquece a mesa.
 *
 * Não aparece na própria tela de cobrança: lá o botão de pagar já está à
 * vista.
 */

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/billing/money";
import { getFaturaEmAberto, type FaturaEmAberto } from "@/lib/billing/faturaEmAberto.functions";

const CHAVE_ADIADO = "flycontrol:fatura-adiada";

/** "2026-10-14" no fuso de quem está olhando — o "hoje" do lojista. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Adiado hoje para ESTA fatura? Fatura nova sempre aparece. */
function foiAdiadoHoje(invoiceId: string): boolean {
  try {
    return localStorage.getItem(CHAVE_ADIADO) === `${invoiceId}|${hojeLocal()}`;
  } catch {
    return false;
  }
}

function adiarParaAmanha(invoiceId: string): void {
  try {
    localStorage.setItem(CHAVE_ADIADO, `${invoiceId}|${hojeLocal()}`);
  } catch {
    // Sem armazenamento (aba anônima): o aviso só volta na próxima visita.
  }
}

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function FaturaEmAbertoPopup({
  companyId,
  oculto,
}: {
  companyId: string | null;
  /** Verdadeiro na tela de cobrança, onde o botão já está à vista. */
  oculto: boolean;
}) {
  const [fatura, setFatura] = useState<FaturaEmAberto>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    getFaturaEmAberto({ data: { companyId } })
      .then((f) => {
        if (cancelado) return;
        setFatura(f);
        setAberto(!!f && !foiAdiadoHoje(f.invoiceId));
      })
      .catch(() => {
        // Sem tabelas de cobrança ou sem conexão: sem aviso, sem erro na tela.
      });
    return () => {
      cancelado = true;
    };
  }, [companyId]);

  if (!fatura || oculto) return null;

  const vencida = fatura.status === "overdue";
  const vencimento = formatarData(fatura.dueAt);

  const fechar = () => {
    adiarParaAmanha(fatura.invoiceId);
    setAberto(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Receipt className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">
            {vencida ? "Sua fatura do FlyControl está vencida" : "Sua fatura do FlyControl chegou"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {vencida
              ? "Pague para liberar a loja de novo. Assim que o pagamento é confirmado, o painel e os pedidos voltam a funcionar e um novo mês começa a contar."
              : "O mês do seu plano fechou. Pague para renovar o ciclo e continuar recebendo pedidos sem interrupção."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Fatura {fatura.numero}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{formatCents(fatura.totalCents)}</p>
          {vencimento && (
            <p
              className={`mt-2 flex items-center justify-center gap-1.5 text-sm ${vencida ? "font-semibold text-destructive" : "text-muted-foreground"}`}
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {vencida ? `Venceu em ${vencimento}` : `Vence em ${vencimento}`}
            </p>
          )}
        </div>

        {!fatura.checkoutUrl && (
          <p className="text-center text-sm text-muted-foreground">
            O link de pagamento ainda está sendo gerado. Tente de novo em alguns minutos ou fale com
            o suporte.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {fatura.checkoutUrl && (
            <Button asChild className="h-12 w-full gap-2 text-base">
              <a href={fatura.checkoutUrl} target="_blank" rel="noreferrer">
                Pagar com Pix ou cartão <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={fechar}>
            Lembrar mais tarde
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

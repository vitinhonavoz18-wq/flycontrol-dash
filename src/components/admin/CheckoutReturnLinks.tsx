/**
 * Os links de retorno para colar no painel da InfinityPay.
 *
 * Eles precisam ser exatos e absolutos, e são exatamente o tipo de coisa que
 * se erra ao transcrever à mão. Aqui saem prontos, derivados da origem em que
 * a página está aberta, com botão de copiar.
 */

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkoutReturnUrl } from "@/lib/billing/checkout";
import { PLAN_PRICING, PUBLIC_PLAN_CODES, type PlanCode } from "@/lib/billing/plans";
import { formatCents } from "@/lib/billing/money";

export function CheckoutReturnLinks() {
  // A origem só existe no navegador; no SSR não há URL para montar.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="font-bold">Links de retorno da InfinityPay</h2>
          <p className="text-sm text-muted-foreground">
            Com <code>INFINITYPAY_HANDLE</code> configurado, cada cadastro já gera seu próprio link
            de pagamento com este retorno embutido — nada para colar manualmente. Estes endereços
            servem de referência e continuam valendo para quem ainda usa o modo manual (links fixos
            colados à mão no painel da InfinityPay).
          </p>
        </div>

        <div className="space-y-3">
          {PUBLIC_PLAN_CODES.map((plan) => (
            <LinkRow key={plan} plan={plan} origin={origin} />
          ))}
        </div>

        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">
            No modo manual, o retorno não é confirmação de pagamento.
          </strong>{" "}
          Esta URL é fixa e pública: quem a abrir chega na mesma tela de quem pagou. Por isso o
          cliente que volta do checkout fica em <em>aguardando pagamento</em>, e a ativação é feita
          aqui nesta tela. No modo automático (com
          <code> INFINITYPAY_HANDLE</code>) isso não se aplica: a ativação é feita pelo aviso de
          pagamento (webhook), sempre reconferido diretamente com a InfinityPay.
        </p>
      </CardContent>
    </Card>
  );
}

function LinkRow({ plan, origin }: { plan: PlanCode; origin: string | null }) {
  const [copied, setCopied] = useState(false);
  const pricing = PLAN_PRICING[plan];
  const url = origin ? checkoutReturnUrl(origin, plan) : null;

  const amountCents =
    pricing.billingModel === "monthly_fixed" ? pricing.monthlyFeeCents : pricing.setupFeeCents;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o texto está na
      // tela e pode ser selecionado à mão.
      toast.error("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">{pricing.name}</span>
        <span className="text-sm text-muted-foreground">
          {amountCents > 0
            ? `checkout de entrada: ${formatCents(amountCents)}`
            : "sem valor de entrada — a conta é liberada sem passar pelo checkout"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm">
          {url ?? "…"}
        </code>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => void copy()}
            disabled={!url}
            aria-label={`Copiar link de retorno do plano ${pricing.name}`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          {url && (
            <Button variant="ghost" className="h-11 gap-2" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Abrir link de retorno do plano {pricing.name}</span>
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING, cycleUnitLabel, type PremiumPlanCode } from "@/lib/billing/plans";
import {
  cancelScheduledPlanChange,
  getPlanChangeOffer,
  schedulePlanChange,
  type PlanChangeOffer,
} from "@/lib/billing/scheduledPlanChange.functions";
import { effectiveDateLabel } from "@/lib/billing/scheduledPlanChange";

/**
 * Troca de plano agendada e oferta de preço novo, na tela "Plano e cobrança".
 *
 * Só aparece para quem já é assinante Premium. Três situações:
 *   1. Já existe troca marcada → mostra "a partir de dd/mm você passa para X
 *      por R$ Y" e o botão de desfazer.
 *   2. Preço antigo (ex.: R$ 375,00) → oferta "Seu plano tem um preço novo".
 *   3. Preço atual → convite para trocar mensal ↔ anual na próxima renovação.
 *
 * Nada aqui cobra na hora. A troca vale na virada do ciclo.
 */
export function TrocaDePlanoAgendada({ onChanged }: { onChanged?: () => void }) {
  const [offer, setOffer] = useState<PlanChangeOffer | undefined>(undefined);
  const [escolha, setEscolha] = useState<PremiumPlanCode | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    void getPlanChangeOffer()
      .then(setOffer)
      .catch(() => setOffer(null));
  }, []);
  useEffect(carregar, [carregar]);

  if (!offer) return null;

  const atual = `${formatCents(offer.contractedCycleFeeCents)}/${cycleUnitLabel(offer.intervalMonths)}`;
  const quando = effectiveDateLabel(offer.cycleEnd);
  const disponiveis = (Object.keys(offer.options) as PremiumPlanCode[]).filter(
    (c) => offer.options[c].decision.ok,
  );

  async function confirmar(code: PremiumPlanCode) {
    setEnviando(true);
    try {
      const r = await schedulePlanChange({ data: { planCode: code, accepted: true } });
      toast.success(
        r.status === "awaiting_team"
          ? "Escolha registrada. A equipe aplica quando retomar sua cobrança."
          : "Troca agendada para a próxima renovação.",
      );
      setEscolha(null);
      carregar();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível agendar a troca.");
    } finally {
      setEnviando(false);
    }
  }

  async function desfazer() {
    setEnviando(true);
    try {
      await cancelScheduledPlanChange();
      toast.success("Agendamento desfeito. Seu plano continua como está.");
      carregar();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível desfazer.");
    } finally {
      setEnviando(false);
    }
  }

  // 1. Troca já marcada.
  if (offer.scheduled) {
    return (
      <Card className="border-primary/40 bg-primary/5" data-testid="troca-agendada">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-bold">Troca de plano agendada</p>
              <p className="text-muted-foreground">{offer.scheduled.sentence}</p>
              <p className="text-xs text-muted-foreground">
                Até lá você continua no plano atual ({atual}). Nada é cobrado agora.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-11"
            disabled={enviando}
            onClick={() => void desfazer()}
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Desfazer agendamento
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (disponiveis.length === 0) return null;

  // Passo de confirmação: diz exatamente o que vai acontecer antes do clique final.
  if (escolha) {
    const alvo = PLAN_PRICING[escolha];
    const valor = `${formatCents(alvo.cycleFeeCents)}/${cycleUnitLabel(alvo.billingIntervalMonths)}`;
    return (
      <Card className="border-primary/40">
        <CardContent className="space-y-3 p-4 text-sm">
          <p className="font-bold">Confirmar a troca para o {alvo.name}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              {offer.billingPaused
                ? "Sua cobrança está pausada pela equipe da FlyControl. A escolha fica registrada e vale quando a equipe retomar a cobrança — nada é cobrado nem reativado agora."
                : `Vale a partir da próxima renovação${quando ? ` (${quando})` : ""}. Até lá, nada muda e nada é cobrado.`}
            </li>
            <li>
              Na renovação, a cobrança passa a ser de <strong>{valor}</strong>
              {alvo.billingIntervalMonths === 12
                ? " — um pagamento único por 12 meses, não uma mensalidade."
                : "."}
            </li>
            <li>Sem cobrança dobrada e sem acerto de dias. Dá para desfazer até a renovação.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" disabled={enviando} onClick={() => void confirmar(escolha)}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar troca
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setEscolha(null)}>
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 2. Oferta de preço novo para quem está num preço antigo.
  if (offer.legacy) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5" data-testid="oferta-preco-novo">
        <CardContent className="space-y-3 p-4 text-sm">
          <p className="flex items-center gap-2 text-base font-black">
            <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Seu plano tem um preço novo: {formatCents(PLAN_PRICING.premium.cycleFeeCents)}/mês ou{" "}
            {formatCents(PLAN_PRICING.premium_anual.cycleFeeCents)}/ano
          </p>
          <p className="text-muted-foreground">
            Hoje você paga {atual}. Se quiser, passe para o preço novo — vale a partir da próxima
            renovação, com os mesmos recursos. Nada muda se você não escolher.
          </p>
          {offer.billingPaused && (
            <p className="text-xs text-muted-foreground">
              Sua cobrança está pausada pela equipe. O aceite fica registrado e só passa a valer
              quando a equipe retomar a cobrança.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {disponiveis.map((code) => (
              <Button
                key={code}
                variant={code === "premium_anual" ? "default" : "outline"}
                className="h-11"
                onClick={() => setEscolha(code)}
              >
                Quero {offer.options[code].priceLabel}
                {code === "premium_anual" ? " (12 meses)" : ""}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. Troca mensal ↔ anual na próxima renovação.
  const outro = disponiveis[0];
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p>
          {outro === "premium_anual"
            ? `Prefere pagar uma vez por ano? ${PLAN_PRICING.premium_anual.name}: ${offer.options[outro].priceLabel}, a partir da próxima renovação.`
            : `Prefere voltar ao pagamento mensal? ${PLAN_PRICING.premium.name}: ${offer.options[outro].priceLabel}, a partir da próxima renovação.`}
        </p>
        <Button variant="outline" className="h-11" onClick={() => setEscolha(outro)}>
          Agendar troca
        </Button>
      </CardContent>
    </Card>
  );
}

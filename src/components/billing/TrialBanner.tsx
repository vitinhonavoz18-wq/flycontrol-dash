/**
 * Contador do período gratuito, para o topo do painel.
 *
 * Regra de convivência: isto é um lembrete, não um anúncio. Ele ocupa uma
 * faixa fina, não cobre nada, não pisca e não tem botão de fechar que precise
 * ser caçado. Quem está no meio do almoço com trinta pedidos na fila não pode
 * ter a tela disputada por uma peça de marketing.
 *
 * Não aparece quando não há período gratuito em andamento.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { asBillingDb } from "@/lib/billing/supabaseBridge";
import { calculateTrialProgress, formatTrialDate, type TrialProgress } from "@/lib/billing/trial";

type TrialInfo = {
  progress: TrialProgress;
  trialEnd: Date;
};

export function TrialBanner() {
  const { user } = useAuth();
  const [info, setInfo] = useState<TrialInfo | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;

    const { data: company } = await supabase
      .from("pizzerias")
      .select("id")
      .eq("owner_id", user.id)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();

    if (!company) return;

    const { data, error } = await asBillingDb(supabase)
      .from("subscriptions")
      .select("status, trial_started_at, trial_ends_at")
      .eq("company_id", company.id)
      .maybeSingle();

    // Sem assinatura, sem tabelas de cobrança ou fora do período grátis: a
    // faixa simplesmente não existe. Nada de erro na tela por causa disso.
    if (error || !data) return;

    const row = data as {
      status: string;
      trial_started_at: string | null;
      trial_ends_at: string | null;
    };

    if (row.status !== "free_trial" || !row.trial_started_at || !row.trial_ends_at) return;

    const trialEnd = new Date(row.trial_ends_at);
    setInfo({
      progress: calculateTrialProgress({
        trialStart: new Date(row.trial_started_at),
        trialEnd,
        now: new Date(),
      }),
      trialEnd,
    });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!info) return null;

  const { progress } = info;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span aria-hidden="true">🎁</span> Você está no período grátis
        </p>
        <p className="text-sm font-black text-primary">{progress.message}</p>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progress.daysElapsed}
        aria-valuemin={0}
        aria-valuemax={progress.durationDays}
        aria-label={`Dia ${progress.daysElapsed} de ${progress.durationDays} do período grátis`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Termina em {formatTrialDate(info.trialEnd)}</span>
        {/* Link discreto de propósito: quem quiser entender a cobrança acha,
            quem não quiser não é interrompido. */}
        <Link to="/billing" className="underline underline-offset-2 hover:text-foreground">
          Entender como funciona a cobrança
        </Link>
      </div>
    </div>
  );
}

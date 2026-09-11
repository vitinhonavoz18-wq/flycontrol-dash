import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import { usePlan } from "@/lib/plan-context";
import {
  FEATURE_LABELS,
  featureEhContratadaAParte,
  FEATURES_CONTRATADAS_A_PARTE,
  type Feature,
} from "@/lib/planPermissions";
import { addonDaFeature } from "@/lib/addons";

/**
 * Tela mostrada quando o plano atual não inclui a funcionalidade.
 *
 * Não é apenas um bloqueio: diz qual recurso falta, o que mais vem junto e
 * quanto custa. Bloquear sem oferecer o caminho de saída é frustrar o cliente
 * sem converter.
 *
 * Isto é UX. O bloqueio de verdade está no servidor (`plan-guard.ts`) e na
 * RLS — esconder a tela nunca foi a proteção.
 */
export function PremiumFeatureLock({ feature }: { feature?: Feature }) {
  const premium = PLAN_PRICING.premium;
  const featureName = feature ? FEATURE_LABELS[feature] : null;
  // Só entra na lista o que o upgrade realmente entrega. O Chat é vendido à
  // parte: prometê-lo aqui seria anunciar sobremesa que não vem no combo — o
  // cliente assina, não recebe, e liga bravo (com razão).
  const allRestricted = (Object.keys(FEATURE_LABELS) as Feature[])
    .filter((f) => !featureEhContratadaAParte(f))
    .map((f) => FEATURE_LABELS[f]);
  const vendidosAParte = FEATURES_CONTRATADAS_A_PARTE.map((f) => FEATURE_LABELS[f]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 p-6 text-center sm:p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {featureName ? `${featureName} faz parte do PREMIUM` : "Funcionalidade do plano PREMIUM"}
        </h1>
        <p className="max-w-md text-muted-foreground">
          Faça upgrade para liberar {allRestricted.join(", ")} e os demais recursos avançados.
        </p>
      </div>

      <ul className="space-y-1.5 text-left text-sm">
        {allRestricted.map((label) => (
          <li key={label} className="flex items-center gap-2">
            <Check
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
      </ul>

      <p className="text-sm font-bold text-primary">
        {formatCents(premium.monthlyFeeCents)} por mês, sem cobrança por pedido
      </p>

      {vendidosAParte.length > 0 && (
        <p className="max-w-md text-xs text-muted-foreground">
          {vendidosAParte.join(", ")}: recurso adicional, contratado à parte do plano.
        </p>
      )}

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="h-12">
          <Link to="/plans">Conhecer o PREMIUM</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link to="/billing">Ver meu plano atual</Link>
        </Button>
      </div>
    </div>
  );
}

export function RequireFeature({
  feature,
  children,
  semContratacao,
}: {
  feature: Feature;
  children: ReactNode;
  /**
   * O que mostrar quando o PLANO inclui a aba mas a loja ainda não CONTRATOU
   * o recurso (hoje só o Chat). São duas situações bem diferentes e merecem
   * telas diferentes: uma pede upgrade de plano, a outra pede uma conversa
   * com o suporte. Mandar o cliente premium para a tela de "assine o
   * premium" seria vender o que ele já tem.
   */
  semContratacao?: ReactNode;
}) {
  const { hasFeature, hasAddon, loading } = usePlan();
  if (loading) return null;
  // O nome do recurso vai junto: "Mesas faz parte do PREMIUM" comunica muito
  // mais que "Funcionalidade exclusiva".
  if (!hasFeature(feature)) return <PremiumFeatureLock feature={feature} />;

  const addon = addonDaFeature(feature);
  if (addon && !hasAddon(addon)) {
    return <>{semContratacao ?? <PremiumFeatureLock feature={feature} />}</>;
  }

  return <>{children}</>;
}

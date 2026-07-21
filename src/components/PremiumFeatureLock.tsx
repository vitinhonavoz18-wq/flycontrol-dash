import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePlan } from "@/lib/plan-context";
import type { Feature } from "@/lib/planPermissions";

export function PremiumFeatureLock() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Funcionalidade Exclusiva</h1>
      <p className="max-w-md text-muted-foreground">
        Esta funcionalidade está disponível apenas para empresas do Plano Premium.
      </p>
      <Button onClick={() => toast.info("Em breve: tela de upgrade de plano. Fale com o suporte para adiantar essa mudança.")}>
        Conhecer Plano Premium
      </Button>
    </div>
  );
}

export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { hasFeature, loading } = usePlan();
  if (loading) return null;
  if (!hasFeature(feature)) return <PremiumFeatureLock />;
  return <>{children}</>;
}

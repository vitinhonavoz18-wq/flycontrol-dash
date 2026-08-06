import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsDashboard } from "@/components/admin/dashboards/SubscriptionsDashboard";
import { SubscriptionAdminPanel } from "@/components/admin/SubscriptionAdminPanel";
import { CheckoutReturnLinks } from "@/components/admin/CheckoutReturnLinks";

export const Route = createFileRoute("/_app/admin/subscriptions")({
  component: AdminSubscriptionsPage,
});

function AdminSubscriptionsPage() {
  return (
    <div className="space-y-10 p-4 sm:p-6 md:p-8">
      {/* Painel novo, sobre a tabela `subscriptions`: ações auditadas, passando
          pela máquina de estados e executadas no servidor.

          O dashboard antigo continua abaixo de propósito: ele é a única visão
          das empresas que ainda NÃO têm assinatura criada, e removê-lo agora
          deixaria essas empresas sem nenhuma gestão. Sai quando todas
          estiverem migradas. */}
      <SubscriptionAdminPanel />

      <section className="border-t border-border pt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Configuração do checkout
        </h2>
        <CheckoutReturnLinks />
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Gestão de planos por empresa (visão anterior)
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Empresas sem assinatura criada ainda são geridas por aqui.
        </p>
        <SubscriptionsDashboard />
      </section>
    </div>
  );
}

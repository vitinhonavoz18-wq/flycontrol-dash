import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsDashboard } from "@/components/admin/dashboards/SubscriptionsDashboard";

export const Route = createFileRoute("/_app/admin/subscriptions")({ 
  component: AdminSubscriptionsPage 
});

function AdminSubscriptionsPage() {
  return <SubscriptionsDashboard />;
}

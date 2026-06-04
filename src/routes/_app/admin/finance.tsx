import { createFileRoute } from "@tanstack/react-router";
import { FinanceDashboard } from "@/components/admin/dashboards/FinanceDashboard";

export const Route = createFileRoute("/_app/admin/finance")({ 
  component: AdminFinancePage 
});

function AdminFinancePage() {
  return <FinanceDashboard />;
}

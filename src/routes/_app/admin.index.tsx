import { createFileRoute } from "@tanstack/react-router";
import { PizzeriasDashboard } from "@/components/admin/dashboards/PizzeriasDashboard";

export const Route = createFileRoute("/_app/admin/")({ component: AdminPizzeriasPage });

function AdminPizzeriasPage() {
  return <PizzeriasDashboard />;
}

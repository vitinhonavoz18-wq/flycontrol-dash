import { createFileRoute } from "@tanstack/react-router";
import { ClubCentsDashboard } from "@/components/admin/dashboards/ClubCentsDashboard";

export const Route = createFileRoute("/_app/admin/cents")({
  component: AdminCentsPage,
});

function AdminCentsPage() {
  return <ClubCentsDashboard />;
}

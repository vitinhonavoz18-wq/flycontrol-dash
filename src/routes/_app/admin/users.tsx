import { createFileRoute } from "@tanstack/react-router";
import { UsersDashboard } from "@/components/admin/dashboards/UsersDashboard";

export const Route = createFileRoute("/_app/admin/users")({ 
  component: AdminUsersPage 
});

function AdminUsersPage() {
  return <UsersDashboard />;
}

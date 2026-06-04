import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/admin/dashboards/AnalyticsDashboard";

export const Route = createFileRoute("/_app/admin/analytics")({ 
  component: AdminAnalyticsPage 
});

function AdminAnalyticsPage() {
  return <AnalyticsDashboard />;
}

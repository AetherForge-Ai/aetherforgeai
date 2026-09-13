import { renderDashboardView } from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return renderDashboardView("home");
}

import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard", {
  title: "Dashboard · AetherForge AI",
  description: "Your AetherForge paper book.",
});

export default function DashboardPage() {
  return renderDashboardView("home");
}

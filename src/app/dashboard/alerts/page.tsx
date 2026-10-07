import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/alerts", {
  title: "Price Alerts · AetherForge AI",
  description: "Price alerts for the holdings on your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("alerts");
}

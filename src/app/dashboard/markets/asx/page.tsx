import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/markets/asx", {
  title: "ASX Markets · AetherForge AI",
  description: "ASX prices beside your AetherForge paper book.",
});

export default function Page() {
  return renderDashboardView("asx");
}

import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/markets/nasdaq", {
  title: "NASDAQ Markets · AetherForge AI",
  description: "NASDAQ prices beside your AetherForge paper book.",
});

export default function Page() {
  return renderDashboardView("nasdaq");
}

import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/markets/dow", {
  title: "Dow Jones Markets · AetherForge AI",
  description: "Dow Jones prices beside your AetherForge paper book.",
});

export default function Page() {
  return renderDashboardView("dow");
}

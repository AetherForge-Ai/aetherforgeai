import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/stocks", {
  title: "Stock Portfolio · AetherForge AI",
  description: "Paper stock holdings on your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("stocks");
}

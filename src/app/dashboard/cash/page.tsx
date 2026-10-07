import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/cash", {
  title: "Cash Balance · AetherForge AI",
  description: "Paper cash on your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("cash");
}

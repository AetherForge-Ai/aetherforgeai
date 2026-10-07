import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/metals", {
  title: "Precious Metals · AetherForge AI",
  description: "Paper gold and silver on your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("metals");
}

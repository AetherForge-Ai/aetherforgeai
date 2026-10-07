import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/bots", {
  title: "Run AI Bots · AetherForge AI",
  description: "Run the AetherForge bots against your paper book.",
});

export default function Page() {
  return renderDashboardView("bots");
}

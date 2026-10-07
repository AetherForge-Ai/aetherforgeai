import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/crypto", {
  title: "Crypto Portfolio · AetherForge AI",
  description: "Paper crypto holdings on your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("crypto");
}

import { renderDashboardView } from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ASX Markets · AetherForge AI",
};

export default function Page() {
  return renderDashboardView("asx");
}

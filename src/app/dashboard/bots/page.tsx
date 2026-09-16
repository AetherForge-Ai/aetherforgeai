import { renderDashboardView } from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Run AI Bots · AetherForge AI",
};

export default function Page() {
  return renderDashboardView("bots");
}

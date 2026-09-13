import { renderDashboardView } from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dow Jones Markets · AetherForge AI",
};

export default function Page() {
  return renderDashboardView("dow");
}

import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PerformancePanel } from "@/components/dashboard/PerformancePanel";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance · AetherForge AI", robots: { index: false, follow: false } };

/** Goal b12 G-02: XIRR, TWR and periods for the signed-in book. */
export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=%2Fdashboard%2Fperformance");
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}>
      <PerformancePanel />
    </AppShell>
  );
}

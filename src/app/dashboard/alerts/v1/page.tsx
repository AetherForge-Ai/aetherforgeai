import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AlertsV1Panel } from "@/components/briefs/AlertsV1Panel";
import { alertsV1Enabled } from "@/lib/alerts-v1";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts · AetherForge AI", robots: { index: false, follow: false } };

/** Goal b17 G-04: behind IN_APP_ALERTS_V1=1; in app only until K-05 is decided. */
export default async function AlertsV1Page() {
  if (!alertsV1Enabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=%2Fdashboard%2Falerts%2Fv1");
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}>
      <AlertsV1Panel />
    </AppShell>
  );
}

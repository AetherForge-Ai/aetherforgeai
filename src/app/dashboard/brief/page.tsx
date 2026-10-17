import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MondayBriefPanel } from "@/components/briefs/MondayBriefPanel";
import { briefsEnabled } from "@/lib/monday-brief";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monday Briefing · AetherForge AI", robots: { index: false, follow: false } };

/** Goal b17 G-03: behind IN_APP_BRIEFS=1 until K-05 and K-12 are decided. */
export default async function BriefPage() {
  if (!briefsEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=%2Fdashboard%2Fbrief");
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}>
      <MondayBriefPanel />
    </AppShell>
  );
}

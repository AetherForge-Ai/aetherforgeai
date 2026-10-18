import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { WholeWealthPanel } from "@/components/dashboard/WholeWealthPanel";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Whole wealth · AetherForge AI", robots: { index: false, follow: false } };

/** Goal b19 G-21. */
export default async function WealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=%2Fdashboard%2Fwealth");
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}>
      <WholeWealthPanel />
    </AppShell>
  );
}

import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ProjectionsExplorer } from "@/components/dashboard/ProjectionsExplorer";

export const dynamic = "force-dynamic";

/**
 * /projections — the weekly "Top Projections" browser. A Top-50 board per market
 * (NZX · ASX · Dow Jones · Nasdaq · Crypto) with rank, price, projected 7-day
 * move, confidence, signal and the reasoning behind every call. Market-wide public
 * intelligence, so it's viewable by guests and members alike (a strong acquisition
 * surface) — the same global top nav frames it, no sidebar.
 */
export default async function ProjectionsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <ProjectionsExplorer />
      </AppShell>
    );
  }

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <ProjectionsExplorer />
    </AppShell>
  );
}

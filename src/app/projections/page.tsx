import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { ProjectionsExplorer } from "@/components/dashboard/ProjectionsExplorer";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/projections", {
  title: "Projections — AetherForge AI",
  description: "Weekly projections across NZX and ASX. Each equity tab lists the names that came back, up to 50. Crypto projections are paused. General information, not personal advice.",
});

/**
 * /projections — weekly projections. Each equity tab lists the names that came
 * back, up to 50, with rank, price, projected 7-day move, confidence and the
 * reasoning behind every call. Crypto projections stay paused. Guests and
 * members can read the page.
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

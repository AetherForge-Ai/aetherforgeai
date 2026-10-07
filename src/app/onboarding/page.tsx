import { redirect } from "next/navigation";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { resolveDisplayName } from "@/lib/user-display";
import { OnboardingPageClient } from "@/components/dashboard/OnboardingPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/onboarding", {
    title: "Onboarding — AetherForge AI",
    description: "Set up your paper book on AetherForge.",
  }),
  robots: { index: false, follow: false },
};

/** Deep link for the paper-book checklist. Signed-out visits go to login. */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/onboarding");

  return (
    <AppShell
      user={{
        name: resolveDisplayName(user) || user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <OnboardingPageClient />
    </AppShell>
  );
}

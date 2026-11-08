import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RedirectSignedOut } from "@/components/auth/RedirectSignedOut";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { SharingPanel } from "@/components/sharing/SharingPanel";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { featureOnFor } from "@/lib/preview-grading";
import { getCurrentUser } from "@/lib/session";
import { resolveDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/settings/sharing", {
  title: "Sharing · AetherForge AI",
  description: "Share your paper book read-only with a family member or accountant by copy-link.",
});

/** b66 G-27: owner sharing controls. Behind PORTFOLIO_SHARING=on (off = 404). */
export default async function SharingSettingsPage() {
  const user = await getCurrentUser();
  // b91 G-27: flag off = 404, except for allow-listed test accounts (preview grading).
  if (!featureOnFor("PORTFOLIO_SHARING", user as never)) notFound();
  if (!user) redirect("/login?redirect=/settings/sharing");
  return (
    <RedirectSignedOut redirectTo="/settings/sharing">
      <AppShell
        user={{
          name: resolveDisplayName(user) || user.name,
          email: user.email,
          image: user.image,
          subscription_status: user.subscription_status,
          subscription_plan: user.subscription_plan,
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only sharing for your paper book.</p>
          <SettingsSectionNav current="sharing" />
          <SharingPanel />
        </div>
      </AppShell>
    </RedirectSignedOut>
  );
}

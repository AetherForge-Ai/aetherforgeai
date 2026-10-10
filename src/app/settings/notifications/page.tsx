import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RedirectSignedOut } from "@/components/auth/RedirectSignedOut";
import { NotificationsPanel } from "@/components/settings/NotificationsPanel";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { resolveDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/settings/notifications", {
  title: "Notifications · AetherForge AI",
  description: "Choose which AetherForge AI paper-book notes to prepare. Sending is off.",
});

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings/notifications");

  return (
    <RedirectSignedOut redirectTo="/settings/notifications">
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
          <p className="mt-1 text-sm text-muted-foreground">Email choices for your paper book.</p>
          <SettingsSectionNav current="notifications" />
          <NotificationsPanel />
        </div>
      </AppShell>
    </RedirectSignedOut>
  );
}

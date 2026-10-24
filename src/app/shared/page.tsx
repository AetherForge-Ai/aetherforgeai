import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SharedWithMe } from "@/components/sharing/SharedWithMe";
import { flagOn } from "@/lib/schema/types";
import { getCurrentUser } from "@/lib/session";
import { resolveDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared with me · AetherForge AI", robots: { index: false, follow: false } };

/** b66 G-27: books shared with this account (read-only). Behind PORTFOLIO_SHARING=on (off = 404). */
export default async function SharedWithMePage() {
  if (!flagOn("PORTFOLIO_SHARING")) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/shared");
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
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Shared with me</h1>
        <p className="mt-1 text-sm text-muted-foreground">Books other members have shared with you. Read-only.</p>
        <SharedWithMe />
      </div>
    </AppShell>
  );
}

import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MarketsPageContent } from "@/components/dashboard/MarketsPageContent";
import { parseMarketsTab } from "@/lib/market-detail-routes";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/markets", {
  title: "Markets · AetherForge AI",
  description: "NZX, ASX, Dow Jones and NASDAQ prices on AetherForge. Paper research, not a broker.",
});

/**
 * /markets — the full-page "Stock Markets" browser (linked prominently from the
 * sidebar nav). Shows every live ticker across NZX · ASX · Dow Jones · NASDAQ.
 * Logged-out visitors get a read-only preview; members can buy in one click.
 */
export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  const tab = parseMarketsTab((await searchParams).tab);

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketsPageContent preview initialTab={tab} />
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
      <MarketsPageContent userId={user.id} initialTab={tab} />
    </AppShell>
  );
}

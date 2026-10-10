import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MarketsPageContent } from "@/components/dashboard/MarketsPageContent";
import { parseMarketsTab } from "@/lib/market-detail-routes";
import { loadPublicMarketIndex } from "@/lib/public-market-index";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<Metadata> {
  const tab = parseMarketsTab((await searchParams).tab);
  if (tab === "CRYPTO") {
    return publicPageMetadata("/markets?tab=crypto", {
      title: "Crypto markets · AetherForge AI",
      description: "Coins by market cap from CoinGecko, with the native chain or platform. The page states the count it returned. Paper research, not a broker.",
    });
  }
  if (tab === "DEX") {
    return publicPageMetadata("/markets?tab=dex", {
      title: "DEX markets · AetherForge AI",
      description: "DEX tokens by 24-hour volume from GeckoTerminal, with chain and DEX. The page states the count it returned. Paper research, not a broker.",
    });
  }
  return publicPageMetadata("/markets", {
    title: "Markets · AetherForge AI",
    description: "NZX, ASX, Dow Jones and NASDAQ prices on AetherForge. Paper research, not a broker.",
  });
}

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
  const index = await loadPublicMarketIndex();

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketsPageContent preview initialTab={tab} index={index} />
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
      <MarketsPageContent userId={user.id} initialTab={tab} index={index} />
    </AppShell>
  );
}

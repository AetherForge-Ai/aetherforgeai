import { MARKETS_SSR_DEADLINE_MS, withDeadline } from "@/lib/ticker-serve";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MarketsPageContent } from "@/components/dashboard/MarketsPageContent";
import { parseMarketsTab } from "@/lib/market-detail-routes";
import { loadPublicMarketIndex } from "@/lib/public-market-index";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { snapshotMetaOther } from "@/lib/crypto-snapshot";
import { dexscreenerPublicDisplay, dexPoweredByLine } from "@/lib/dexscreener-display";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<Metadata> {
  const meta = await marketsMetadata(searchParams);
  // b30 H-1: x-af-snapshot-at / x-af-snapshot-version as meta tags.
  return { ...meta, other: { ...(meta.other ?? {}), ...(await snapshotMetaOther()) } };
}

async function marketsMetadata(searchParams: Promise<{ tab?: string }>): Promise<Metadata> {
  const tab = parseMarketsTab((await searchParams).tab);
  if (tab === "CRYPTO") {
    return publicPageMetadata("/markets?tab=crypto", {
      title: "Crypto markets · AetherForge AI",
      description: "Coins by market cap from the price feed that answered, with the chain or platform when that feed sent one. The page states the count it returned. Paper research, not a broker.",
    });
  }
  if (tab === "DEX") {
    return publicPageMetadata("/markets?tab=dex", {
      title: "DEX markets · AetherForge AI",
      description: dexscreenerPublicDisplay()
        ? "DEX tokens by 24-hour volume from GeckoTerminal and DexScreener, with chain and DEX. The page states the count it returned. Paper research, not a broker."
        : "DEX tokens by 24-hour volume from GeckoTerminal, with chain and DEX. The page states the count it returned. Paper research, not a broker.",
    });
  }
  return publicPageMetadata("/markets", {
    title: "Markets · AetherForge AI",
    description: "NZX, ASX, Dow Jones, NASDAQ and NYSE prices on AetherForge. Counts say how many names are shown. Paper research, not a broker.",
  });
}

/**
 * /markets — the full-page "Stock Markets" browser (linked prominently from the
 * sidebar nav). Shows every live ticker across NZX · ASX · Dow Jones · NASDAQ.
 * Logged-out visitors get a read-only preview; members can buy in one click.
 */
function MarketsTimeout() {
  return (
    <AppShell tone="dark" guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Markets</h1>
        <p className="mt-2 text-sm opacity-80">Prices are taking longer than usual to load. Refresh the page in a few seconds.</p>
      </main>
    </AppShell>
  );
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // b37 REG-1: /markets once gave no first byte for 30 s. The session lookup and the index build run in
  // parallel, each with a hard deadline; a slow session read renders the public view instead of hanging.
  const [user, tab, index] = await Promise.all([
    withDeadline(getCurrentUser(), MARKETS_SSR_DEADLINE_MS, null),
    searchParams.then((p) => parseMarketsTab(p.tab)),
    withDeadline(loadPublicMarketIndex(), MARKETS_SSR_DEADLINE_MS + 3_000, null),
  ]);
  if (!index) return <MarketsTimeout />;

  if (!user) {
    return (
      <AppShell tone="dark" guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketsPageContent preview initialTab={tab} index={index} dexCredit={dexPoweredByLine()} />
      </AppShell>
    );
  }

  return (
    <AppShell
      tone="dark"
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <MarketsPageContent userId={user.id} initialTab={tab} index={index} dexCredit={dexPoweredByLine()} />
    </AppShell>
  );
}

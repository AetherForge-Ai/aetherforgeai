import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { MarketNewsPageContent } from "@/components/dashboard/MarketNewsPageContent";
import { loadMarketNews } from "@/lib/market-news";
import { filterServableNews } from "@/lib/news-serve";
import { officialPublicNews } from "@/lib/news-present";
import type { NewsItem } from "@/lib/market-intel";
import { readSharedDexBoard } from "@/lib/crypto-board-store";
import { buildDexPanel, type DexPanel } from "@/lib/dex-news-panel";

/** b88 MN-DEX-1: the saved DEX board, bounded so news never waits on it. Empty falls back to /api/crypto/dex. */
async function loadDexPanel(): Promise<DexPanel> {
  try {
    const page = await Promise.race([
      readSharedDexBoard(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return buildDexPanel(page ? { at: page.at ?? null, rows: page.rows } : null);
  } catch {
    return buildDexPanel(null);
  }
}

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/market-news", {
  title: "Market News · AetherForge AI",
  description: "Market headlines for the exchanges and assets AetherForge follows. Not a broker, and not financial advice.",
});

/**
 * /market-news — dedicated Market News page (same header/footer chrome as other app pages).
 * Extracted from the Dashboard Market News section.
 */
export default async function MarketNewsPage() {
  const user = await getCurrentUser();
  const dexPanel = await loadDexPanel();
  let initialNews: NewsItem[] = officialPublicNews();
  try {
    const loaded = filterServableNews(await loadMarketNews("stock"));
    if (loaded.length > 2) initialNews = loaded;
  } catch {
    initialNews = officialPublicNews();
  }

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketNewsPageContent preview initialNews={initialNews} dexPanel={dexPanel} />
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
      <MarketNewsPageContent initialNews={initialNews} dexPanel={dexPanel} />
    </AppShell>
  );
}

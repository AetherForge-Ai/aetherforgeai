import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { MarketNewsPageContent } from "@/components/dashboard/MarketNewsPageContent";
import { loadMarketNews } from "@/lib/market-news";
import { officialPublicNews } from "@/lib/news-present";
import type { NewsItem } from "@/lib/market-intel";

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
  let initialNews: NewsItem[] = officialPublicNews();
  try {
    const loaded = await loadMarketNews("stock");
    if (loaded.length > 2) initialNews = loaded;
  } catch {
    initialNews = officialPublicNews();
  }

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketNewsPageContent preview initialNews={initialNews} />
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
      <MarketNewsPageContent initialNews={initialNews} />
    </AppShell>
  );
}

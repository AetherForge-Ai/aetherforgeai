import { NextResponse } from "next/server";
import { analyzeUniverse, universeFor, getMarketNews, type AssetClass } from "@/lib/market-intel";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/market?bot=stock|crypto
 * Returns the full analysed universe (technical intel per security) plus the
 * curated news feed for the requested bot. Stocks are anchored to Twelve Data
 * live prices (when a key is configured); crypto is anchored to CoinGecko
 * (no key required). Falls back to the deterministic engine on any error.
 * Kept server-side so the market-data API key never reaches the client.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assetClass: AssetClass = url.searchParams.get("bot") === "crypto" ? "crypto" : "stock";

    const tickers = universeFor(assetClass).map((e) => e.ticker);
    let overrides: Record<string, number> = {};
    let histories: Record<string, number[]> = {};
    let live = false;

    if (isLiveConfiguredFor(assetClass)) {
      // Fetch live intraday quotes AND real recent daily-close histories in
      // parallel. The histories are what make signals + 7-day projections track
      // each security's ACTUAL momentum (so the lists reflect real performance
      // and change as the market moves), while quotes pin the latest price.
      const [quotes, hist] = await Promise.all([
        fetchQuotesForAssetClass(tickers, assetClass).catch((err) => {
          console.error("[api/market] Live quote fetch failed:", err);
          return {} as Awaited<ReturnType<typeof fetchQuotesForAssetClass>>;
        }),
        fetchHistoriesForAssetClass(tickers, assetClass).catch((err) => {
          console.error("[api/market] History fetch failed:", err);
          return {} as Record<string, number[]>;
        }),
      ]);
      overrides = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q.price]));
      histories = hist;
      live = Object.keys(overrides).length > 0 || Object.keys(histories).length > 0;
    }

    const universe = analyzeUniverse(overrides, assetClass, histories);
    console.log(
      `[api/market] Served ${universe.length} ${assetClass} securities ` +
        `(source: ${live ? "live" : "deterministic"}, ${Object.keys(overrides).length} quotes, ${Object.keys(histories).length} real histories)`
    );

    return NextResponse.json({
      ok: true,
      data: { bot: assetClass, live, universe, news: getMarketNews(assetClass) },
    });
  } catch (err: any) {
    console.error("[api/market] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load market data" }, { status: 500 });
  }
}

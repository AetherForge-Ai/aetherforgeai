import { NextResponse } from "next/server";
import { analyzeUniverse, universeFor, getMarketNews, type AssetClass } from "@/lib/market-intel";
import { fetchQuotesForAssetClass, isLiveConfiguredFor } from "@/lib/market-data";

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

    let overrides: Record<string, number> = {};
    let live = false;

    if (isLiveConfiguredFor(assetClass)) {
      try {
        const quotes = await fetchQuotesForAssetClass(
          universeFor(assetClass).map((e) => e.ticker),
          assetClass
        );
        overrides = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q.price]));
        live = Object.keys(overrides).length > 0;
      } catch (err) {
        console.error("[api/market] Live quote fetch failed (using deterministic engine):", err);
      }
    }

    const universe = analyzeUniverse(overrides, assetClass);
    console.log(
      `[api/market] Served ${universe.length} ${assetClass} securities (source: ${live ? "live" : "deterministic"})`
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

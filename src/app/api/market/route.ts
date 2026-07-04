import { NextResponse } from "next/server";
import { analyzeUniverse, MARKET_UNIVERSE, getMarketNews } from "@/lib/market-intel";
import { fetchLiveQuotes, isLiveDataConfigured } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/market
 * Returns the full analysed universe (technical intel per security) plus the
 * curated news feed. When a live market-data key is configured, each security is
 * anchored to its real-time price; otherwise the deterministic engine is used.
 * Kept server-side so the market-data API key never reaches the client.
 */
export async function GET() {
  try {
    let overrides: Record<string, number> = {};
    let live = false;

    if (isLiveDataConfigured()) {
      try {
        const quotes = await fetchLiveQuotes(MARKET_UNIVERSE.map((e) => e.ticker));
        overrides = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q.price]));
        live = Object.keys(overrides).length > 0;
      } catch (err) {
        console.error("[api/market] Live quote fetch failed (using deterministic engine):", err);
      }
    }

    const universe = analyzeUniverse(overrides);
    console.log(`[api/market] Served ${universe.length} securities (source: ${live ? "live" : "deterministic"})`);

    return NextResponse.json({ ok: true, data: { live, universe, news: getMarketNews() } });
  } catch (err: any) {
    console.error("[api/market] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load market data" }, { status: 500 });
  }
}

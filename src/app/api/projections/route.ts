import { NextResponse } from "next/server";
import { analyzeUniverse, universeFor } from "@/lib/market-intel";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { assembleEquityProjections } from "@/lib/projection-pause";

export const dynamic = "force-dynamic";

/**
 * GET /api/projections
 *
 * Powers the Projections page's "All Markets" view. Runs ONE exhaustive sweep
 * across the COMPLETE investable universe:
 *   • Equities — the full NZX + ASX + NASDAQ + DOW JONES universe, anchored to
 *     live prices + real 30-day histories.
 * Crypto rows are omitted. The Crypto tab shows a pause message until coin
 * history and the live price come from one checked source.
 * It then ranks equities by projected 7-day % increase (highest → lowest)
 * and returns the TOP 50, each still carrying its own `market`.
 *
 * Kept server-side so the market-data key never reaches the client.
 */
export async function GET() {
  try {
    // --- Full equities universe (NZX + ASX + Dow + Nasdaq), live-anchored ----
    let overrides: Record<string, number> = {};
    let histories: Record<string, number[]> = {};
    let stockLive = false;
    const stockTickers = universeFor("stock").map((e) => e.ticker);
    if (isLiveConfiguredFor("stock")) {
      const [quotes, hist] = await Promise.all([
        fetchQuotesForAssetClass(stockTickers, "stock").catch((err) => {
          console.error("[api/projections] Equity quote fetch failed:", err);
          return {} as Awaited<ReturnType<typeof fetchQuotesForAssetClass>>;
        }),
        fetchHistoriesForAssetClass(stockTickers, "stock").catch((err) => {
          console.error("[api/projections] Equity history fetch failed:", err);
          return {} as Record<string, number[]>;
        }),
      ]);
      overrides = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q.price]));
      histories = hist;
      stockLive = Object.keys(overrides).length > 0 || Object.keys(histories).length > 0;
    }
    const stockUniverse = analyzeUniverse(overrides, "stock", histories);
    const ranked = assembleEquityProjections(stockUniverse);

    console.log(
      `[api/projections] Equity sweep: ${ranked.scanned.stocks} names → top ${ranked.combined.length} ` +
        `(stock live=${stockLive}). Crypto projections paused.`
    );

    return NextResponse.json({
      ok: true,
      data: {
        live: stockLive,
        ...ranked,
      },
    });
  } catch (err: any) {
    console.error("[api/projections] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load projections" }, { status: 500 });
  }
}

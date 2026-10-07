import { NextResponse } from "next/server";
import { analyzeUniverse, universeFor } from "@/lib/market-intel";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { loadCryptoBoardLive } from "@/lib/crypto-tape";
import { CRYPTO_PROJECTION_HAND_CHECK } from "@/lib/crypto-vendors";
import { assembleEquityProjections } from "@/lib/projection-pause";
import { toPublicMarketRecord } from "@/lib/public-intel";
import { quotedEquitySessionOpen } from "@/lib/market-freshness";

export const dynamic = "force-dynamic";

/**
 * GET /api/projections
 *
 * Powers the Projections page's "All Markets" view. Runs ONE exhaustive sweep
 * across the COMPLETE investable universe:
 *   • Equities — the full NZX + ASX + NASDAQ + DOW JONES universe, anchored to
 *     live prices + real 30-day histories.
 * Crypto uses the same price and history service as /api/market?bot=crypto.
 * Those rows stay off this board until the 10-coin hand-check is done
 * (BTC, ETH, SOL, BNB, XRP, ARB, TON, JUP, UNI, APT).
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
      const quotedMarkets = universeFor("stock")
        .filter((entry) => {
          const price = overrides[entry.ticker];
          return typeof price === "number" && price > 0;
        })
        .map((entry) => entry.market);
      stockLive = quotedEquitySessionOpen(quotedMarkets);
    }
    const stockUniverse = analyzeUniverse(overrides, "stock", histories);

    // Same tape as the crypto market bot. The board stays paused, so the
    // prints are checked and logged, then left off the ranking.
    const cryptoTickers = Array.from(
      new Set([...universeFor("crypto").map((row) => row.ticker), ...CRYPTO_PROJECTION_HAND_CHECK])
    );
    await loadCryptoBoardLive(cryptoTickers).catch((err) => {
      console.error("[api/projections] Crypto tape failed:", err);
      return null;
    });
    const ranked = assembleEquityProjections(stockUniverse);
    const publish = <T,>(rows: T[]) =>
      rows.map((row) => toPublicMarketRecord(row as unknown as Record<string, unknown>));

    console.log(
      `[api/projections] Equity sweep: ${ranked.scanned.stocks} names → top ${ranked.combined.length} ` +
        `(stock live=${stockLive}). Crypto projections paused.`
    );

    return NextResponse.json({
      ok: true,
      data: {
        live: stockLive,
        cryptoPaused: ranked.cryptoPaused,
        cryptoPauseMessage: ranked.cryptoPauseMessage,
        combined: publish(ranked.combined),
        stockUniverse: publish(ranked.stockUniverse),
        cryptoUniverse: [],
        scanned: ranked.scanned,
      },
    });
  } catch (err: any) {
    console.error("[api/projections] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load projections" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { analyzeUniverse, resolveExchange, universeFor, type MarketCode } from "@/lib/market-intel";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { loadCryptoBoardLive } from "@/lib/crypto-tape";
import { CRYPTO_PROJECTION_HAND_CHECK } from "@/lib/crypto-vendors";
import { assembleEquityProjections } from "@/lib/projection-pause";
import {
  illustrativeRange,
  PROJECTION_ROW_DROPPED_KEYS,
  projectionsEquitiesMode,
  PROJECTIONS_PAUSED_MESSAGE,
  sortProjectionsNeutral,
} from "@/lib/projections-mode";
import { toPublicMarketRecord } from "@/lib/public-intel";
import { quotedEquitySessionOpen } from "@/lib/market-freshness";
import { getStableSessionUser } from "@/lib/session";

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
 * CR-3: rows are listed A–Z with an illustrative 7-day range. There is no
 * point percent, no model-confidence field and no ranking.
 *
 * Kept server-side so the market-data key never reaches the client.
 * The session read is the same one GET /api/session uses for the dashboard.
 * A signed-out request stops here, before any ranking.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const mode = projectionsEquitiesMode();
    if (mode === "paused") {
      return NextResponse.json({
        ok: true,
        data: {
          mode,
          pausedMessage: PROJECTIONS_PAUSED_MESSAGE,
          live: false,
          cryptoPaused: true,
          exchange: "NONE",
          page: 1,
          limit: 0,
          total: 0,
          rows: [],
          combined: [],
          stockUniverse: [],
          cryptoUniverse: [],
          scanned: { stocks: 0, crypto: 0 },
        },
      });
    }

    const url = new URL(req.url);
    const exchange = (url.searchParams.get("exchange") || "NZXASX").toUpperCase();
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit")) || 25));
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
    const onExchange = (row: { ticker: string; market: string }) =>
      resolveExchange(row.ticker, row.market as MarketCode);
    // CR-3: no confidence ranking and no "top 50 movers" cut. Every quoted name on
    // the chosen board, A–Z.
    const pool = sortProjectionsNeutral(
      exchange === "ALL"
        ? ranked.stockUniverse
        : exchange === "NZXASX"
          ? ranked.stockUniverse.filter((row) => {
              const board = onExchange(row);
              return board === "NZX" || board === "ASX";
            })
          : exchange === "NZX" || exchange === "ASX" || exchange === "DOW" || exchange === "NASDAQ"
            ? ranked.stockUniverse.filter((row) => onExchange(row) === exchange)
            : ranked.stockUniverse,
    );
    const start = (page - 1) * limit;
    const pageRows = pool.slice(start, start + limit);
    const publish = (rows: typeof pageRows) =>
      rows.map((row) => {
        const pub = toPublicMarketRecord(row as unknown as Record<string, unknown>);
        const range = illustrativeRange((row as { outlook?: unknown }).outlook);
        for (const key of PROJECTION_ROW_DROPPED_KEYS) delete pub[key];
        delete pub.outlook;
        pub.rangeLowPct = range?.lowPct ?? null;
        pub.rangeHighPct = range?.highPct ?? null;
        return pub;
      });

    console.log(
      `[api/projections] Equity sweep: ${ranked.scanned.stocks} names → page ${page} ` +
        `${pageRows.length}/${pool.length} (${exchange}, stock live=${stockLive}). Crypto projections paused.`
    );

    return NextResponse.json({
      ok: true,
      data: {
        mode,
        live: stockLive,
        cryptoPaused: ranked.cryptoPaused,
        cryptoPauseMessage: ranked.cryptoPauseMessage,
        exchange,
        page,
        limit,
        total: pool.length,
        rows: publish(pageRows),
        combined: publish(pageRows),
        stockUniverse: publish(pageRows),
        cryptoUniverse: [],
        scanned: ranked.scanned,
      },
    });
  } catch (err: any) {
    console.error("[api/projections] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load projections" }, { status: 500 });
  }
}

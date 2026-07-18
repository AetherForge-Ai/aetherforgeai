import { NextResponse } from "next/server";
import { analyzeUniverse, universeFor, type SecurityIntel } from "@/lib/market-intel";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { fetchCryptoMarketIntel } from "@/lib/koins-market";

export const dynamic = "force-dynamic";

/**
 * GET /api/projections
 *
 * Powers the Projections page's "All Markets" view. Runs ONE exhaustive sweep
 * across the COMPLETE investable universe:
 *   • Equities — the full NZX + ASX + NASDAQ + DOW JONES universe, anchored to
 *     live prices + real 30-day histories.
 *   • Crypto — the COMPLETE live cryptocurrency market (top-500 via Swyftx →
 *     CoinGecko), each coin run through the same technical engine.
 * It then ranks every name across ALL markets combined by projected 7-day %
 * increase (strictly highest → lowest) and returns the TOP 50, each still
 * carrying its own `market` so the UI can label it (NASDAQ, Crypto, NZX, …).
 *
 * The per-market universes are returned too so the page's individual exchange
 * tabs (incl. the full crypto tab) render from the same single fetch.
 * Kept server-side so the market-data / Swyftx keys never reach the client.
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

    // --- Complete live cryptocurrency market (top-500) ----------------------
    const cryptoIntel = await fetchCryptoMarketIntel().catch((err) => {
      console.error("[api/projections] Crypto full-market intel failed:", err);
      return [] as SecurityIntel[];
    });
    const cryptoLive = cryptoIntel.length > 0;
    // Fall back to the deterministic core crypto universe so the crypto leg is
    // never empty (the page can never go blank).
    const cryptoUniverse = cryptoIntel.length ? cryptoIntel : analyzeUniverse({}, "crypto");

    // --- Combined TOP 50 across ALL markets, strictly highest → lowest % -----
    const combined = [...stockUniverse, ...cryptoUniverse]
      .slice()
      .sort((a, b) => b.projected7dPct - a.projected7dPct)
      .slice(0, 50);

    console.log(
      `[api/projections] Combined sweep: ${stockUniverse.length} equities + ${cryptoUniverse.length} crypto ` +
        `→ top ${combined.length} (stock live=${stockLive}, crypto live=${cryptoLive})`
    );

    return NextResponse.json({
      ok: true,
      data: {
        live: stockLive || cryptoLive,
        combined,
        stockUniverse,
        cryptoUniverse,
        scanned: { stocks: stockUniverse.length, crypto: cryptoUniverse.length },
      },
    });
  } catch (err: any) {
    console.error("[api/projections] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load projections" }, { status: 500 });
  }
}

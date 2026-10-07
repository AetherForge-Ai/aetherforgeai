import { NextResponse } from "next/server";
import { analyzeUniverse, priceMatchesUniverseSeed, universeFor, getMarketNews, type AssetClass } from "@/lib/market-intel";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { loadMarketNews } from "@/lib/market-news";
import {
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { filterPublishedCrypto, loadCryptoBoardLive, selectKoinsUniverse } from "@/lib/crypto-tape";
import { CRYPTO_PROJECTIONS_PAUSED, CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "@/lib/projection-pause";
import { toPublicPayload } from "@/lib/public-intel";

export const dynamic = "force-dynamic";

/**
 * GET /api/market?bot=stock|crypto
 * Returns the full analysed universe (technical intel per security) plus the
 * curated news feed for the requested bot. Stocks are anchored to Twelve Data
 * live prices (when a key is configured); crypto uses the CoinGecko tape.
 * A failed crypto load publishes no rows. Directory seed prices are equities-only.
 * Kept server-side so the market-data API key never reaches the client.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assetClass: AssetClass = url.searchParams.get("bot") === "crypto" ? "crypto" : "stock";

    const tickers = universeFor(assetClass).map((e) => e.ticker);
    let overrides: Record<string, number> = {};
    let histories: Record<string, number[]> = {};
    let change24h: Record<string, number> = {};
    let live = false;
    let cryptoBoardFailed = false;

    if (assetClass === "crypto") {
      try {
        const board = await loadCryptoBoardLive(tickers);
        overrides = board.quotes;
        histories = board.histories;
        change24h = board.change24h;
        live = Object.keys(overrides).length > 0;
      } catch (err) {
        cryptoBoardFailed = true;
        console.error("[api/market] Crypto tape failed:", err);
      }
    } else if (isLiveConfiguredFor(assetClass)) {
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
      // When a market is closed (or a quote batch skipped a symbol), pin any
      // missing ticker to its last real daily close so Top 20 / movers never
      // render blank price cells.
      for (const [t, series] of Object.entries(histories)) {
        if (overrides[t] && overrides[t]! > 0) continue;
        const last = series?.[series.length - 1];
        if (typeof last === "number" && isFinite(last) && last > 0) {
          overrides[t] = last;
        }
      }
      live = Object.keys(overrides).length > 0 || Object.keys(histories).length > 0;
      if (assetClass === "stock") {
        const suspects = Object.keys(overrides).filter((ticker) =>
          priceMatchesUniverseSeed(ticker, overrides[ticker]!)
        );
        await Promise.all(
          suspects.map(async (ticker) => {
            const quote = await fetchYahooQuote(ticker).catch(() => null);
            if (quote && quote.price > 0 && !priceMatchesUniverseSeed(ticker, quote.price)) {
              overrides[ticker] = quote.price;
            } else {
              delete overrides[ticker];
            }
          })
        );
      }
    }

    // Crypto never falls through to analyzeUniverse's directory seeds.
    // Until the 10-coin hand-check is done, this feed publishes no rows and no projections.
    const cryptoWithheld = assetClass === "crypto" && (CRYPTO_PROJECTIONS_PAUSED || cryptoBoardFailed || !live);
    const universe =
      assetClass === "crypto"
        ? selectKoinsUniverse({
            paused: cryptoWithheld,
            quotes: overrides,
            rows: cryptoWithheld
              ? []
              : filterPublishedCrypto(analyzeUniverse(overrides, "crypto", histories), { histories, change24h }),
            histories,
            change24h,
          })
        : analyzeUniverse(overrides, assetClass, histories);
    if (assetClass === "crypto") live = universe.length > 0;
    const news = await loadMarketNews(assetClass).catch((err) => {
      console.error("[api/market] Live news fetch failed — curated fallback:", err);
      return getMarketNews(assetClass);
    });
    console.log(
      `[api/market] Served ${universe.length} ${assetClass} securities ` +
        `(source: ${live ? "live" : "deterministic"}, ${Object.keys(overrides).length} quotes, ${Object.keys(histories).length} real histories, ${news.length} headlines)`
    );

    return NextResponse.json({
      ok: true,
      data: toPublicPayload({
        bot: assetClass,
        live,
        universe,
        news,
        ...(assetClass === "crypto"
          ? {
              cryptoPaused: CRYPTO_PROJECTIONS_PAUSED,
              cryptoPauseMessage: CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
            }
          : {}),
      }),
    });
  } catch (err: any) {
    console.error("[api/market] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load market data" }, { status: 500 });
  }
}

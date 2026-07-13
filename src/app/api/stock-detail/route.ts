import { NextResponse } from "next/server";
import {
  fetchYahooQuote,
  fetchYahooHistories,
  yahooEquitySymbol,
} from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock-detail?symbol=FPH.NZ
 *
 * Powers the detailed single-stock view opened when a ticker is clicked in any
 * market table. Returns the live quote (price, day high/low, 52-week range,
 * volume, market cap where available) plus a real ~6-month daily-close series
 * for the chart. All keyless from Yahoo Finance (server-side).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("symbol") || "").trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: "symbol is required" }, { status: 400 });
    }

    const ySymbol = yahooEquitySymbol(raw);
    // Optional range so lightweight views (e.g. the Holdings 7-day chart) can
    // fetch a short daily series instead of the full 6-month history.
    const rangeParam = (url.searchParams.get("range") || "6mo").trim();
    const allowedRanges = new Set(["5d", "1mo", "3mo", "6mo", "1y"]);
    const range = allowedRanges.has(rangeParam) ? rangeParam : "6mo";
    console.log(`[api/stock-detail] Loading detail for ${ySymbol} (range=${range})`);

    const [quote, histories] = await Promise.all([
      fetchYahooQuote(ySymbol),
      fetchYahooHistories({ [raw]: ySymbol }, range, "1d"),
    ]);

    if (!quote) {
      return NextResponse.json(
        { ok: false, error: `No live quote available for ${raw}` },
        { status: 404 }
      );
    }

    const history = histories[raw] ?? [];

    return NextResponse.json({
      ok: true,
      data: {
        symbol: raw.replace(/\.(NZ|AX|L)$/i, ""),
        ticker: raw,
        name: quote.name || raw,
        currency: quote.currency,
        exchangeLabel: quote.exchangeLabel ?? null,
        exchangeTimezone: quote.exchangeTimezone ?? null,
        quote: {
          price: quote.price,
          changePct: quote.changePct,
          changeAbs: quote.changeAbs,
          prevClose: quote.prevClose,
          open: quote.open ?? null,
          dayHigh: quote.dayHigh ?? null,
          dayLow: quote.dayLow ?? null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          volume: quote.volume ?? null,
          marketCap: quote.marketCap ?? null,
        },
        history, // oldest → newest daily closes
        asOf: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("[api/stock-detail] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load stock detail" },
      { status: 500 }
    );
  }
}

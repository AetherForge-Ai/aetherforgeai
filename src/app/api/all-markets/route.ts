import { NextResponse } from "next/server";
import {
  entriesForExchange,
  resolveExchange,
  EXCHANGE_META,
  type Exchange,
} from "@/lib/market-intel";
import { fetchYahooQuotes, yahooEquitySymbol, type YahooQuote } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

const VALID: Exchange[] = ["NZX", "ASX", "DOW", "NASDAQ"];

export interface AllMarketsRow {
  ticker: string; // internal ticker (e.g. BHP.AX)
  symbol: string; // clean display symbol (suffix stripped)
  name: string;
  sector: string;
  exchange: Exchange;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  changePct: number;
  volume: number | null;
  live: boolean; // true when this row came from a genuine live quote
}

/**
 * GET /api/all-markets?exchange=NZX|ASX|DOW|NASDAQ
 *
 * Returns the complete live list of tickers on a single exchange with the
 * latest price, session % change and volume. Data is pulled keyless from Yahoo
 * Finance (server-side) so it is always fresh — never the frozen snapshot the
 * old Market Snapshot table showed. Any ticker Yahoo can't price falls back to
 * its universe reference price (flagged `live: false`) so the table is never
 * blank, but the numbers you see are live wherever the market is quoting.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("exchange") || "").toUpperCase();
    const exchange = (VALID.includes(raw as Exchange) ? raw : "NASDAQ") as Exchange;

    const entries = entriesForExchange(exchange);
    const meta = EXCHANGE_META[exchange];

    // internalTicker → Yahoo symbol (identical for equities).
    const map: Record<string, string> = {};
    for (const e of entries) map[e.ticker] = yahooEquitySymbol(e.ticker);

    let quotes: Record<string, YahooQuote> = {};
    try {
      quotes = await fetchYahooQuotes(map);
    } catch (err) {
      console.error(`[api/all-markets] Live quote fetch failed for ${exchange}:`, err);
    }

    const rows: AllMarketsRow[] = entries.map((e) => {
      const q = quotes[e.ticker];
      const live = !!q && q.price > 0;
      return {
        ticker: e.ticker,
        symbol: e.ticker.replace(/\.(NZ|AX|L)$/i, ""),
        name: q?.name || e.name,
        sector: e.sector,
        exchange: resolveExchange(e.ticker, e.market),
        currency: meta.currency,
        price: live ? q!.price : e.basePrice,
        changePct: live ? Number(q!.changePct.toFixed(2)) : 0,
        volume: live && typeof q!.volume === "number" ? q!.volume : null,
        live,
      };
    });

    const liveCount = rows.filter((r) => r.live).length;
    console.log(
      `[api/all-markets] ${exchange}: ${liveCount}/${rows.length} rows live-priced`
    );

    return NextResponse.json({
      ok: true,
      data: {
        exchange,
        label: meta.label,
        sub: meta.sub,
        currency: meta.currency,
        live: liveCount > 0,
        liveCount,
        total: rows.length,
        asOf: new Date().toISOString(),
        rows,
      },
    });
  } catch (err: any) {
    console.error("[api/all-markets] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load market list" },
      { status: 500 }
    );
  }
}

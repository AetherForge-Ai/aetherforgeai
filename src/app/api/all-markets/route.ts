import { NextResponse } from "next/server";
import {
  entriesForExchange,
  resolveExchange,
  EXCHANGE_META,
  type Exchange,
} from "@/lib/market-intel";
import { fetchYahooQuotes, yahooEquitySymbol, type YahooQuote } from "@/lib/yahoo-finance";
import { equityApiLive, exchangeFreshnessLabel, latestQuoteTime, parseQuoteTime } from "@/lib/market-freshness";
import { parseAllMarketsExchange } from "@/lib/all-markets-query";
import { plausibleShareVolume } from "@/lib/share-volume";

export const dynamic = "force-dynamic";

export interface AllMarketsRow {
  ticker: string; // internal ticker (e.g. BHP.AX)
  symbol: string; // clean display symbol (suffix stripped)
  name: string;
  sector: string;
  exchange: Exchange;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  changePct: number;
  changeAbs: number; // absolute currency move vs previous close
  dayHigh: number | null; // session high
  dayLow: number | null; // session low
  volume: number | null;
  marketCap: number | null; // where Yahoo exposes it
  /** True only while this exchange's session is open and a quote arrived. */
  live: boolean;
  /** True when a vendor quote priced the row. Closed sessions stay quoted. */
  quoted: boolean;
  freshness: string;
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
    const parsed = parseAllMarketsExchange(url.searchParams.get("exchange"));
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: "Unknown exchange. Use NZX, ASX, DOW or NASDAQ." },
        { status: 400 },
      );
    }
    const exchange: Exchange = parsed.exchange;

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

    const quotedAt = latestQuoteTime(Object.values(quotes).map((q) => q.quotedAt));
    const freshness = exchangeFreshnessLabel(exchange, new Date(), quotedAt);

    const rows: AllMarketsRow[] = entries.map((e) => {
      const q = quotes[e.ticker];
      const quoted = !!q && q.price > 0;
      const live = equityApiLive(exchange, quoted);
      const rowQuote = parseQuoteTime(q?.quotedAt);
      return {
        ticker: e.ticker,
        symbol: e.ticker.replace(/\.(NZ|AX|L)$/i, ""),
        name: q?.name || e.name,
        sector: e.sector,
        exchange: resolveExchange(e.ticker, e.market),
        currency: meta.currency,
        price: quoted ? q!.price : e.basePrice,
        changePct: quoted ? Number(q!.changePct.toFixed(2)) : 0,
        changeAbs: quoted ? Number(q!.changeAbs.toFixed(4)) : 0,
        dayHigh: quoted && typeof q!.dayHigh === "number" ? q!.dayHigh : null,
        dayLow: quoted && typeof q!.dayLow === "number" ? q!.dayLow : null,
        volume: quoted ? plausibleShareVolume(q!.volume, q!.averageVolume) : null,
        marketCap: quoted && typeof q!.marketCap === "number" ? q!.marketCap : null,
        live,
        quoted,
        freshness: exchangeFreshnessLabel(exchange, new Date(), rowQuote).label,
      };
    });

    const quotedCount = rows.filter((r) => r.quoted).length;
    const liveCount = rows.filter((r) => r.live).length;
    console.log(
      `[api/all-markets] ${exchange}: ${quotedCount}/${rows.length} rows quoted, live=${liveCount > 0}`
    );

    return NextResponse.json({
      ok: true,
      data: {
        exchange,
        label: meta.label,
        sub: meta.sub,
        currency: meta.currency,
        live: liveCount > 0,
        liveCount: quotedCount,
        total: rows.length,
        asOf: quotedAt ? quotedAt.toISOString() : null,
        freshness: freshness.label,
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

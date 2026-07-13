import { NextResponse } from "next/server";
import {
  entriesForExchange,
  EXCHANGE_META,
  EXCHANGES,
  type Exchange,
} from "@/lib/market-intel";
import { fetchYahooQuotes, yahooEquitySymbol, type YahooQuote } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

/** Headline index for each user-facing exchange. */
const INDEX_SYMBOL: Record<Exchange, string> = {
  NZX: "^NZ50", // S&P/NZX 50
  ASX: "^AXJO", // S&P/ASX 200
  DOW: "^DJI", // Dow Jones Industrial Average
  NASDAQ: "^IXIC", // Nasdaq Composite
};

const INDEX_NAME: Record<Exchange, string> = {
  NZX: "S&P/NZX 50",
  ASX: "S&P/ASX 200",
  DOW: "Dow Jones Industrial Average",
  NASDAQ: "Nasdaq Composite",
};

export interface SnapshotMover {
  ticker: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAbs: number;
}

export interface ExchangeSnapshot {
  exchange: Exchange;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  index: {
    name: string;
    price: number | null;
    changePct: number | null;
    changeAbs: number | null;
    live: boolean;
  };
  breadth: { advancers: number; decliners: number; unchanged: number; total: number };
  avgChangePct: number; // average session % move across live constituents
  topGainers: SnapshotMover[];
  topLosers: SnapshotMover[];
  liveCount: number;
}

/**
 * GET /api/market-snapshot
 *
 * A quick, live "state of the markets" overview across all four exchanges
 * (NZX / ASX / Dow Jones / NASDAQ). For each it returns the headline index
 * performance, market breadth (advancers vs decliners), the average session
 * move and the top 3 gainers / losers — all pulled keyless from Yahoo Finance
 * server-side so the snapshot is genuinely live, not a frozen table.
 */
export async function GET() {
  try {
    // One combined index request for all four headline indices.
    const indexMap: Record<string, string> = {};
    for (const ex of EXCHANGES) indexMap[ex] = INDEX_SYMBOL[ex];

    let indexQuotes: Record<string, YahooQuote> = {};
    try {
      indexQuotes = await fetchYahooQuotes(indexMap);
    } catch (err) {
      console.error("[api/market-snapshot] index fetch failed:", err);
    }

    const snapshots = await Promise.all(
      EXCHANGES.map(async (exchange): Promise<ExchangeSnapshot> => {
        const meta = EXCHANGE_META[exchange];
        const entries = entriesForExchange(exchange);

        // Live quotes for the whole exchange universe (cached 60s upstream).
        const map: Record<string, string> = {};
        for (const e of entries) map[e.ticker] = yahooEquitySymbol(e.ticker);
        let quotes: Record<string, YahooQuote> = {};
        try {
          quotes = await fetchYahooQuotes(map);
        } catch (err) {
          console.error(`[api/market-snapshot] ${exchange} constituents failed:`, err);
        }

        const movers: SnapshotMover[] = [];
        let advancers = 0;
        let decliners = 0;
        let unchanged = 0;
        let sumPct = 0;
        let liveCount = 0;

        for (const e of entries) {
          const q = quotes[e.ticker];
          if (!q || q.price <= 0) continue;
          liveCount += 1;
          sumPct += q.changePct;
          if (q.changePct > 0.05) advancers += 1;
          else if (q.changePct < -0.05) decliners += 1;
          else unchanged += 1;
          movers.push({
            ticker: e.ticker,
            symbol: e.ticker.replace(/\.(NZ|AX|L)$/i, ""),
            name: q.name || e.name,
            price: q.price,
            changePct: Number(q.changePct.toFixed(2)),
            changeAbs: Number(q.changeAbs.toFixed(4)),
          });
        }

        const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
        const topGainers = sorted.slice(0, 3);
        const topLosers = sorted.slice(-3).reverse().filter((m) => m.changePct < 0);

        const iq = indexQuotes[exchange];
        const indexLive = !!iq && iq.price > 0;

        return {
          exchange,
          label: meta.label,
          sub: meta.sub,
          currency: meta.currency,
          index: {
            name: INDEX_NAME[exchange],
            price: indexLive ? iq!.price : null,
            changePct: indexLive ? Number(iq!.changePct.toFixed(2)) : null,
            changeAbs: indexLive ? Number(iq!.changeAbs.toFixed(2)) : null,
            live: indexLive,
          },
          breadth: {
            advancers,
            decliners,
            unchanged,
            total: liveCount,
          },
          avgChangePct: liveCount ? Number((sumPct / liveCount).toFixed(2)) : 0,
          topGainers,
          topLosers,
          liveCount,
        };
      })
    );

    console.log(
      `[api/market-snapshot] built ${snapshots.length} exchange snapshots ` +
        snapshots.map((s) => `${s.exchange}:${s.liveCount}`).join(" ")
    );

    return NextResponse.json({
      ok: true,
      data: {
        asOf: new Date().toISOString(),
        exchanges: snapshots,
      },
    });
  } catch (err: any) {
    console.error("[api/market-snapshot] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to build market snapshot" },
      { status: 500 }
    );
  }
}

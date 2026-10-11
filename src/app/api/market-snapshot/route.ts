import { NextResponse } from "next/server";
import {
  entriesForExchange,
  EXCHANGE_META,
  EXCHANGES,
  type Exchange,
} from "@/lib/market-intel";
import { fetchYahooQuotes, fetchYahooQuotesBatched, yahooEquitySymbol, type YahooQuote } from "@/lib/yahoo-finance";
import { equityApiLive, exchangeFreshnessLabel, parseQuoteTime } from "@/lib/market-freshness";

export const dynamic = "force-dynamic";

/**
 * In-process cache. A fresh snapshot is returned at once.
 * After the TTL, the previous snapshot is returned and a new one is built in the background.
 * Constituents use one Yahoo spark batch. The four index symbols stay on the quote call.
 *
 * pull-check:retest4-2026-10-11
 */
const SNAPSHOT_MEM_TTL_MS = 45_000;
const SNAPSHOT_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";
let snapshotMem: { at: number; body: unknown } | null = null;
let snapshotInflight: Promise<unknown> | null = null;

/** Cap constituents per exchange so the home tiles stay snappy (Yahoo batch). */
const MAX_CONSTITUENTS = 48;


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
    freshness: string;
  };
  breadth: { advancers: number; decliners: number; unchanged: number; total: number; quoted?: number };
  /** "48 quoted of 60 names in the NZX list" — the list size and the quoted count. */
  universeLabel?: string;
  avgChangePct: number; // average session % move across live constituents
  topGainers: SnapshotMover[];
  topLosers: SnapshotMover[];
  liveCount: number;
}

/** Absolute move implied by the percent change. Zero when the percent is missing. */
function changeAbsFromPct(price: number, changePct: number): number {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct) || changePct <= -100) return 0;
  const prev = price / (1 + changePct / 100);
  if (!Number.isFinite(prev) || prev <= 0) return 0;
  return price - prev;
}

function snapshotResponse(body: unknown, cache: "HIT" | "STALE" | "MISS") {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": SNAPSHOT_CACHE_CONTROL,
      "X-Snapshot-Cache": cache,
    },
  });
}

async function buildSnapshotBody(): Promise<unknown> {
    const indexMap: Record<string, string> = {};
    const constituentMap: Record<string, string> = {};
    const entriesByExchange = new Map<Exchange, ReturnType<typeof entriesForExchange>>();
    for (const exchange of EXCHANGES) {
      indexMap[exchange] = INDEX_SYMBOL[exchange];
      const entries = entriesForExchange(exchange).slice(0, MAX_CONSTITUENTS);
      entriesByExchange.set(exchange, entries);
      for (const entry of entries) constituentMap[`${exchange}:${entry.ticker}`] = yahooEquitySymbol(entry.ticker);
    }

    const [quotes, indexQuotes] = await Promise.all([
      fetchYahooQuotesBatched(constituentMap).catch((err) => {
        console.error("[api/market-snapshot] constituent batch failed:", err);
        return {} as Awaited<ReturnType<typeof fetchYahooQuotesBatched>>;
      }),
      fetchYahooQuotes(indexMap).catch((err) => {
        console.error("[api/market-snapshot] index fetch failed:", err);
        return {} as Record<string, YahooQuote>;
      }),
    ]);

    const snapshots = EXCHANGES.map((exchange): ExchangeSnapshot => {
        const meta = EXCHANGE_META[exchange];
        const entries = entriesByExchange.get(exchange) || [];

        const movers: SnapshotMover[] = [];
        let advancers = 0;
        let decliners = 0;
        let unchanged = 0;
        let sumPct = 0;
        let liveCount = 0;

        for (const e of entries) {
          const q = quotes[`${exchange}:${e.ticker}`];
          if (!q || q.price <= 0) continue;
          liveCount += 1;
          sumPct += q.changePct;
          if (q.changePct > 0.05) advancers += 1;
          else if (q.changePct < -0.05) decliners += 1;
          else unchanged += 1;
          const changeAbs = changeAbsFromPct(q.price, q.changePct);
          movers.push({
            ticker: e.ticker,
            symbol: e.ticker.replace(/\.(NZ|AX|L)$/i, ""),
            name: e.name,
            price: q.price,
            changePct: Number(q.changePct.toFixed(2)),
            changeAbs: Number(changeAbs.toFixed(4)),
          });
        }

        const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
        const topGainers = sorted.slice(0, 3);
        const topLosers = sorted.slice(-3).reverse().filter((m) => m.changePct < 0);

        const iq = indexQuotes[exchange];
        const indexQuoted = !!iq && iq.price > 0;
        const indexLive = equityApiLive(exchange, indexQuoted);
        const indexFresh = exchangeFreshnessLabel(exchange, new Date(), parseQuoteTime(iq?.quotedAt));

        return {
          exchange,
          label: meta.label,
          sub: meta.sub,
          currency: meta.currency,
          index: {
            name: INDEX_NAME[exchange],
            price: indexQuoted ? iq!.price : null,
            changePct: indexQuoted ? Number(iq!.changePct.toFixed(2)) : null,
            changeAbs: indexQuoted ? Number(iq!.changeAbs.toFixed(2)) : null,
            live: indexLive,
            freshness: indexFresh.label,
          },
          breadth: {
            advancers,
            decliners,
            unchanged,
            /** Names in this exchange list. Quoted names can be fewer. */
            total: entries.length,
            quoted: liveCount,
          },
          universeLabel: `${liveCount} quoted of ${entries.length} names in the ${exchange} list`,
          avgChangePct: liveCount ? Number((sumPct / liveCount).toFixed(2)) : 0,
          topGainers,
          topLosers,
          liveCount,
        };
    });

    console.log(
      `[api/market-snapshot] built ${snapshots.length} exchange snapshots ` +
        snapshots.map((s) => `${s.exchange}:${s.liveCount}`).join(" ")
    );

    return {
      ok: true,
      data: {
        asOf: new Date().toISOString(),
        exchanges: snapshots,
      },
    };
}

function startSnapshot(): Promise<unknown> {
  if (!snapshotInflight) {
    snapshotInflight = buildSnapshotBody()
      .then((body) => {
        snapshotMem = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        snapshotInflight = null;
      });
  }
  return snapshotInflight;
}

/**
 * GET /api/market-snapshot
 *
 * Headline index, breadth, and top movers for NZX, ASX, Dow Jones, and NASDAQ.
 * Quotes come from Yahoo Finance. A cached snapshot is served while a newer one is built.
 */
export async function GET() {
  try {
    const now = Date.now();
    if (snapshotMem && now - snapshotMem.at < SNAPSHOT_MEM_TTL_MS) {
      return snapshotResponse(snapshotMem.body, "HIT");
    }
    if (snapshotMem) {
      void startSnapshot().catch((err) => {
        console.error("[api/market-snapshot] background refresh failed:", err);
      });
      return snapshotResponse(snapshotMem.body, "STALE");
    }
    const body = await startSnapshot();
    return snapshotResponse(body, "MISS");
  } catch (err: any) {
    console.error("[api/market-snapshot] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to build market snapshot" },
      { status: 500 }
    );
  }
}

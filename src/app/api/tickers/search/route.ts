import { NextResponse } from "next/server";
import { tickerMatchRank } from "@/lib/asset-search";
import { searchYahooSymbols } from "@/lib/yahoo-finance";
import { searchMarketUniverse } from "@/lib/market-intel";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickers/search?q=... — live symbol lookup across ASX, NZX, NASDAQ and
 * NYSE (NYSE + NASDAQ together cover every Dow Jones Industrial Average member).
 * Keyless (Yahoo Finance). Returns [{ symbol, name, exchange, exchangeLabel }].
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ ok: true, data: [] });

    const local = searchMarketUniverse(q, 24);
    const yahoo = await searchYahooSymbols(q, 24);
    const seen = new Set<string>();
    const results = [...local, ...yahoo]
      .filter((m) => {
        if (seen.has(m.symbol)) return false;
        seen.add(m.symbol);
        return true;
      })
      .sort(
        (a, b) =>
          tickerMatchRank(a.symbol, a.name, q) - tickerMatchRank(b.symbol, b.name, q) ||
          a.symbol.localeCompare(b.symbol)
      )
      .slice(0, 12);
    console.log(`[api/tickers/search] "${q}" → ${results.length} matches (${local.length} local)`);
    return NextResponse.json({ ok: true, data: results });
  } catch (err: any) {
    console.error("[api/tickers/search] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Search failed" }, { status: 500 });
  }
}

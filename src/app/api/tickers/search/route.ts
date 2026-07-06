import { NextResponse } from "next/server";
import { searchYahooSymbols } from "@/lib/yahoo-finance";

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

    const results = await searchYahooSymbols(q, 12);
    console.log(`[api/tickers/search] "${q}" → ${results.length} matches`);
    return NextResponse.json({ ok: true, data: results });
  } catch (err: any) {
    console.error("[api/tickers/search] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Search failed" }, { status: 500 });
  }
}

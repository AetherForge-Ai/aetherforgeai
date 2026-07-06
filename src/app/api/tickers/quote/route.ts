import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickers/quote?symbol=CBA.AX — live price for a chosen symbol.
 * Keyless (Yahoo Finance). Returns { symbol, price, currency, changePct }.
 * `price` is null when the quote can't be resolved (never throws).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });

    const q = await fetchYahooQuote(symbol);
    console.log(`[api/tickers/quote] ${symbol} → ${q ? `$${q.price} ${q.currency}` : "no quote"}`);
    return NextResponse.json({
      ok: true,
      data: {
        symbol,
        price: q?.price ?? null,
        currency: q?.currency ?? null,
        changePct: q?.changePct ?? null,
      },
    });
  } catch (err: any) {
    console.error("[api/tickers/quote] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to fetch quote" }, { status: 500 });
  }
}

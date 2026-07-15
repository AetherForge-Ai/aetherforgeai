import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { fetchCryptoQuotes } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickers/quote?symbol=CBA.AX&type=stock|crypto — live price for a chosen symbol.
 * Equities use Yahoo Finance (keyless); crypto uses the Swyftx-primary crypto feed.
 * Returns { symbol, price, currency, changePct }. `price` is null when the quote
 * can't be resolved (never throws) — the caller falls back to manual entry.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const type = (searchParams.get("type") || "stock").trim().toLowerCase();
    if (!symbol) return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });

    // Crypto path — priced from the same Swyftx-primary source as the rest of the app.
    if (type === "crypto") {
      const quotes = await fetchCryptoQuotes([symbol]);
      const price = quotes[symbol]?.price ?? null;
      console.log(`[api/tickers/quote] (crypto) ${symbol} → ${price ? `$${price} USD` : "no quote"}`);
      return NextResponse.json({
        ok: true,
        data: { symbol, price, currency: price ? "USD" : null, changePct: null },
      });
    }

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

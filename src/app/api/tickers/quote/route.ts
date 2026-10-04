import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { fetchCryptoQuotes } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";
import { CANONICAL_CRYPTO_IDS } from "@/lib/crypto-ids";
import { lookupCryptoId } from "@/lib/crypto-id-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickers/quote?symbol=CBA.AX&type=stock|crypto|metal — live price for a chosen symbol.
 * Equities use Yahoo Finance (keyless); crypto uses the Swyftx-primary crypto feed;
 * metals (GOLD/SILVER) use the live NZD spot per troy ounce. Returns
 * { symbol, price, currency, changePct }. `price` is null when the quote can't be
 * resolved (never throws) — the caller falls back to manual entry.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const type = (searchParams.get("type") || "stock").trim().toLowerCase();
    if (!symbol) return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });

    // Metal path — gold/silver live at the NZD spot per troy ounce.
    if (type === "metal") {
      const spot = await getMetalsSpot();
      const key = symbol === "GOLD" ? "gold" : symbol === "SILVER" ? "silver" : null;
      const price = key ? spot[key].nzdPerOz : null;
      console.log(`[api/tickers/quote] (metal) ${symbol} → ${price ? `NZ$${price.toFixed(2)}/oz` : "no quote"}`);
      return NextResponse.json({
        ok: true,
        data: { symbol, price, currency: price ? "NZD" : null, changePct: null },
      });
    }

    // Crypto path — priced from the same Swyftx-primary source as the rest of the app.
    if (type === "crypto") {
      const explicitId = (searchParams.get("id") || "").trim();
      const remembered = lookupCryptoId(symbol);
      const coinId = explicitId || remembered || "";
      const knownName = Object.prototype.hasOwnProperty.call(CANONICAL_CRYPTO_IDS, symbol);
      // An id from the extended list must not be replaced with a guessed Yahoo print.
      const strict = Boolean(explicitId || (remembered && !knownName));
      const quotes = await fetchCryptoQuotes(
        [symbol],
        coinId ? { ids: { [symbol]: coinId }, ...(strict ? { strictCoinGecko: [symbol] } : {}) } : undefined
      );
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

import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { fetchCryptoQuotes } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";
import { CANONICAL_CRYPTO_IDS } from "@/lib/crypto-ids";
import { lookupCryptoId } from "@/lib/crypto-id-registry";
import { dexQuoteRows } from "@/lib/crypto-coingecko";
import { normaliseUnitPrice } from "@/lib/currency";
import { dexPriceForSymbol } from "@/lib/reviewed-book";

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

    // Crypto path — a DEX row uses GeckoTerminal first (as /trust states), then CoinGecko.
    // Majors stay on the coin list, with GeckoTerminal only when that list has no print.
    if (type === "crypto") {
      const market = (searchParams.get("market") || "").trim().toLowerCase();
      const explicitId = (searchParams.get("id") || "").trim();
      const remembered = lookupCryptoId(symbol);
      const coinId = explicitId || remembered || "";
      const knownName = Object.prototype.hasOwnProperty.call(CANONICAL_CRYPTO_IDS, symbol);
      // An id from the extended list must not be replaced with a guessed Yahoo print.
      const strict = Boolean(explicitId || (remembered && !knownName));
      let price: number | null = null;
      const readCoinList = async (): Promise<number | null> => {
        try {
          const quotes = await fetchCryptoQuotes(
            [symbol],
            coinId
              ? { ids: { [symbol]: coinId }, ...(strict ? { strictCoinGecko: [symbol] } : {}) }
              : undefined
          );
          return quotes[symbol]?.price ?? null;
        } catch (err) {
          console.error(`[api/tickers/quote] coin price for ${symbol} failed:`, err);
          return null;
        }
      };
      const readDex = async (): Promise<number | null> => {
        try {
          const rows = await dexQuoteRows(symbol);
          const tagged = coinId
            ? rows.filter((row) => row.detailId === coinId || row.id === coinId)
            : [];
          const taggedPrice = tagged.length ? dexPriceForSymbol(symbol, tagged) : null;
          return taggedPrice != null && taggedPrice > 0 ? taggedPrice : dexPriceForSymbol(symbol, rows);
        } catch (err) {
          console.error(`[api/tickers/quote] DEX price for ${symbol} failed:`, err);
          return null;
        }
      };
      // A DEX row prices from GeckoTerminal. A coin-list miss falls through to the same list.
      if (market !== "dex") {
        price = await readCoinList();
      }
      if (!(price != null && price > 0)) {
        price = await readDex();
      }
      if (market === "dex" && !(price != null && price > 0)) {
        price = await readCoinList();
      }
      const kept = normaliseUnitPrice(price);
      console.log(`[api/tickers/quote] (crypto) ${symbol} → ${kept ? `$${kept} USD` : "no quote"}`);
      return NextResponse.json({
        ok: true,
        data: { symbol, price: kept, currency: kept ? "USD" : null, changePct: null },
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

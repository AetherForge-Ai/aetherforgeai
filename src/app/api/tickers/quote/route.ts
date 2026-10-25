import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { fetchLiveQuotes } from "@/lib/market-data";
import { closeLabelFor, equitySessionOpen, equityVenue } from "@/lib/market-freshness";
import type { Exchange } from "@/lib/market-intel";
import { fetchCryptoQuotes } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";
import { CANONICAL_CRYPTO_IDS } from "@/lib/crypto-ids";
import { lookupCryptoId } from "@/lib/crypto-id-registry";
import { dexQuoteRows } from "@/lib/crypto-coingecko";
import { normaliseUnitPrice } from "@/lib/currency";
import { dexPriceForSymbol } from "@/lib/reviewed-book";
import { listedCryptoIsStrict, pickListedCryptoPrice } from "@/lib/crypto-quote";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { coverMissingCrypto } from "@/lib/crypto-price-feed";
import { gatePublicPrint } from "@/lib/swyftx-display";
import { formatDisplayDateTime } from "@/lib/currency";
import { chainForTicker } from "@/lib/crypto-board";

export const dynamic = "force-dynamic";

/** Same venue clock the public tape uses for this symbol. */
function equityExchange(symbol: string): Exchange {
  const ticker = symbol.toUpperCase();
  if (ticker.endsWith(".NZ") || ticker.endsWith(".NZX")) return "NZX";
  if (ticker.endsWith(".AX") || ticker.endsWith(".ASX")) return "ASX";
  return "NASDAQ";
}

/**
 * GET /api/tickers/quote?symbol=CBA.AX&type=stock|crypto|metal — quote for a chosen symbol.
 * Equities use Yahoo Finance (keyless); crypto uses the shared price chain;
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
      // A known coin (PEPE, UNI) uses the sell-form coin list even when the Add panel sends an id.
      // An unknown extended id or a pool address stays strict so Yahoo cannot guess the wrong asset.
      const strict = listedCryptoIsStrict(symbol, explicitId, remembered || "", knownName);
      const network = (searchParams.get("network") || "").trim();
      const address = (searchParams.get("address") || "").trim();
      let price: number | null = null;
      let snapshotPrice: number | null = null;
      let snapshotQuotedAt: string | null = null;
      let pricedFromSnapshot = false;
      try {
        const { priceFromSnapshot, liveDexTokenPrice } = await import("@/lib/crypto-board-store");
        const snap = await priceFromSnapshot({ symbol, coinId, address });
        if (snap && snap.price > 0) {
          snapshotPrice = snap.price;
          snapshotQuotedAt = snap.quotedAt;
          pricedFromSnapshot = true;
        }
        if (!(snapshotPrice != null && snapshotPrice > 0) && network && address) {
          snapshotPrice = await liveDexTokenPrice(network, address);
        }
      } catch (err) {
        console.error(`[api/tickers/quote] snapshot price for ${symbol} failed:`, err instanceof Error ? err.message.slice(0, 120) : "failed");
      }
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
      // Snapshot first. A live GeckoTerminal token price is next. The coin list and
      // pool search run only when those two have no print.
      let coinListPrice: number | null = snapshotPrice;
      let dexSearchPrice: number | null = null;
      if (!(coinListPrice != null && coinListPrice > 0)) {
        if (market !== "dex") {
          coinListPrice = await readCoinList();
        }
        if (!(coinListPrice != null && coinListPrice > 0)) {
          dexSearchPrice = await readDex();
        }
        if (market === "dex" && !(dexSearchPrice != null && dexSearchPrice > 0)) {
          coinListPrice = await readCoinList();
        }
      }
      price = pickListedCryptoPrice({ market, dexPrice: dexSearchPrice, coinListPrice });
      let kept = normaliseUnitPrice(price);
      let stale = false;
      let label: string | null = null;
      let source: string | null = null;
      let quotedAt: string | null = null;
      if (pricedFromSnapshot && kept != null && kept > 0) {
        source = "snapshot";
        quotedAt = snapshotQuotedAt;
      }
      if (!(kept != null && kept > 0)) {
        const covered = gatePublicPrint(await coverMissingCrypto(symbol, market === "dex"));
        if (covered && covered.price > 0) {
          kept = covered.price;
          stale = covered.stale;
          source = sourceLabel(covered.source);
          quotedAt = covered.quotedAt;
          const wall = formatDisplayDateTime(covered.quotedAt);
          label = wall && wall !== "—"
            ? `Live price was unavailable. A recent print is filled in (${wall}).`
            : "Live price was unavailable. A recent print is filled in. You can type over it.";
        }
      }
      console.log(`[api/tickers/quote] (crypto) ${symbol} → ${kept ? `$${kept} USD` : "no quote"}`);
      return NextResponse.json({
        ok: true,
        data: {
          symbol,
          price: kept,
          currency: kept ? "USD" : null,
          changePct: null,
          stale,
          source,
          quotedAt,
          chain: chainForTicker(symbol) || null,
          label,
        },
      });
    }

    const exchange = equityExchange(symbol);
    const open = equitySessionOpen(exchange, new Date());
    const live = await fetchLiveQuotes([symbol]).catch(() => ({} as Awaited<ReturnType<typeof fetchLiveQuotes>>));
    const tape = live[symbol];
    const chart = tape && tape.price > 0 ? null : await fetchYahooQuote(symbol);
    const price = tape && tape.price > 0 ? tape.price : chart?.price ?? null;
    const quotedAt = tape?.quotedAt ?? chart?.quotedAt ?? null;
    const session = open ? "open" : "closed";
    const label = open
      ? quotedAt
        ? `Latest price ${formatDisplayDateTime(quotedAt)}`
        : "Latest price"
      : // b67 H-1: same "Close <last session date>" wording as the tape; a Saturday reads Friday's date.
        closeLabelFor(equityVenue(exchange), quotedAt, new Date());
    console.log(`[api/tickers/quote] ${symbol} → ${price ? `$${price}` : "no quote"} ${session}`);
    return NextResponse.json({
      ok: true,
      data: {
        symbol,
        price,
        currency: chart?.currency ?? (symbol.endsWith(".AX") ? "AUD" : symbol.endsWith(".NZ") ? "NZD" : "USD"),
        changePct: tape?.changePct ?? chart?.changePct ?? null,
        quotedAt,
        session,
        label,
      },
    });
  } catch (err: any) {
    console.error("[api/tickers/quote] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to fetch quote" }, { status: 500 });
  }
}

/**
 * GET /api/crypto/price?symbol=BTC
 *
 * Freshest LIVE USD price: Swyftx → CoinGecko → Yahoo (via fetchCryptoQuotes),
 * with top-500 scan as a secondary lookup. Never swallows into a silent empty.
 */
import { NextResponse } from "next/server";
import { formatPublicCryptoPrice, sourceLabel, type ChainPrint } from "@/lib/crypto-price-chain";
import { acceptCryptoPrint, coverMissingCrypto, staleCryptoPrint } from "@/lib/crypto-price-feed";
import { getTop500 } from "@/lib/crypto-source";
import { fetchCryptoQuotes } from "@/lib/market-data";
import { fetchSpotPrices } from "@/lib/crypto-swyftx";

function pricePayload(symbol: string, print: ChainPrint) {
  return {
    symbol,
    name: symbol,
    price: print.price,
    change24h: print.changePct,
    source: sourceLabel(print.source),
    quotedAt: print.quotedAt,
    stale: print.stale,
    label: formatPublicCryptoPrice(print),
  };
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let symbol = "";
  try {
    const url = new URL(req.url);
    symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    // 1) Direct multi-source quote (fast path for Buy dialog + fill integrity)
    try {
      const sx = await fetchSpotPrices([symbol]);
      if (sx[symbol]?.price > 0) {
        const accepted = acceptCryptoPrint(
          symbol,
          { price: sx[symbol].price, changePct: sx[symbol].changePct, source: "swyftx" },
          [],
          "swyftx"
        );
        if (accepted) {
          console.log(`[api/crypto/price] ${symbol} → ${accepted.price} (Swyftx spot)`);
          return NextResponse.json({ ok: true, data: pricePayload(symbol, accepted) });
        }
      }
    } catch (err) {
      console.error("[api/crypto/price] Swyftx spot failed:", err);
    }

    try {
      const q = await fetchCryptoQuotes([symbol]);
      const hit = q[symbol];
      if (hit?.price > 0) {
        console.log(`[api/crypto/price] ${symbol} → ${hit.price} (fetchCryptoQuotes)`);
        return NextResponse.json({
          ok: true,
          data: {
            symbol,
            name: symbol,
            price: hit.price,
            change24h: hit.changePct,
            source: hit.source ? sourceLabel(hit.source) : "quotes",
            quotedAt: hit.quotedAt ?? null,
            stale: !!hit.stale,
            label: formatPublicCryptoPrice({
              symbol,
              price: hit.price,
              changePct: hit.changePct,
              quotedAt: hit.quotedAt || new Date().toISOString(),
              source: hit.source || "coingecko",
              stale: !!hit.stale,
              storedAt: Date.now(),
            }),
          },
        });
      }
    } catch (err) {
      console.error("[api/crypto/price] fetchCryptoQuotes failed:", err);
    }

    // 2) Scan top-500 universe
    try {
      const coins = await getTop500();
      const hit = coins.find((c) => c.symbol.toUpperCase() === symbol && c.price > 0);
      if (hit) {
        const accepted = acceptCryptoPrint(
          hit.symbol,
          { price: hit.price, changePct: hit.change24h, quotedAt: hit.quotedAt, source: "coingecko" },
          [hit.id],
          "coingecko"
        );
        if (accepted) {
          console.log(`[api/crypto/price] ${symbol} → ${accepted.price} (top500)`);
          return NextResponse.json({
            ok: true,
            data: { ...pricePayload(symbol, accepted), name: hit.name },
          });
        }
      }
    } catch (err) {
      console.error("[api/crypto/price] top500 failed:", err);
    }

    const covered = await coverMissingCrypto(symbol);
    if (covered && covered.price > 0) {
      console.log(`[api/crypto/price] ${symbol} → ${covered.price} (${covered.stale ? "last good" : covered.source})`);
      return NextResponse.json({ ok: true, data: pricePayload(symbol, covered) });
    }
    const last = staleCryptoPrint(symbol);
    if (last && last.price > 0) {
      return NextResponse.json({ ok: true, data: pricePayload(symbol, last) });
    }
    console.warn(`[api/crypto/price] No live price found for ${symbol}`);
    return NextResponse.json(
      { ok: false, error: `${symbol} live price unavailable` },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: unknown) {
    console.error("[api/crypto/price] error:", err);
    return NextResponse.json(
      { ok: false, error: symbol ? `${symbol} live price unavailable` : "live price unavailable" },
      { headers: { "cache-control": "no-store" } }
    );
  }
}

/**
 * GET /api/crypto/price?symbol=BTC
 *
 * USD price through the shared chain: CoinGecko, then Swyftx only when
 * SWYFTX_PUBLIC_DISPLAY is on, then Kraken, Coinbase, and mapped Yahoo.
 * The top list is a secondary lookup. A failed read returns the last good
 * price when one is stored.
 */
import { NextResponse } from "next/server";
import { formatPublicCryptoPrice, sourceLabel, type ChainPrint } from "@/lib/crypto-price-chain";
import { acceptCryptoPrint, coverMissingCrypto, staleCryptoPrint } from "@/lib/crypto-price-feed";
import { getTop500 } from "@/lib/crypto-source";
import { gatePublicPrint, publicSourceAllowed } from "@/lib/swyftx-display";

function pricePayload(symbol: string, print: ChainPrint) {
  const gated = gatePublicPrint(print);
  if (!gated) return null;
  return {
    symbol,
    name: symbol,
    price: gated.price,
    change24h: gated.changePct,
    source: sourceLabel(gated.source),
    quotedAt: gated.quotedAt,
    stale: gated.stale,
    label: formatPublicCryptoPrice(gated),
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

    const covered = gatePublicPrint(await coverMissingCrypto(symbol));
    if (covered && covered.price > 0 && !covered.stale) {
      const data = pricePayload(symbol, covered);
      if (data) {
        console.log(`[api/crypto/price] ${symbol} → ${covered.price} (${covered.source})`);
        return NextResponse.json({ ok: true, data });
      }
    }

    try {
      const coins = await getTop500();
      const hit = coins.find((c) => c.symbol.toUpperCase() === symbol && c.price > 0);
      const source = hit?.source && publicSourceAllowed(hit.source) ? hit.source : "";
      if (hit && source) {
        const accepted = gatePublicPrint(
          acceptCryptoPrint(
            hit.symbol,
            { price: hit.price, changePct: hit.change24h, quotedAt: hit.quotedAt, source },
            [hit.id],
            source
          )
        );
        if (accepted) {
          const data = pricePayload(symbol, accepted);
          if (data) {
            console.log(`[api/crypto/price] ${symbol} → ${accepted.price} (top list)`);
            return NextResponse.json({ ok: true, data: { ...data, name: hit.name } });
          }
        }
      }
    } catch (err) {
      console.error("[api/crypto/price] top list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    }

    const last = gatePublicPrint(covered && covered.price > 0 ? covered : staleCryptoPrint(symbol));
    if (last && last.price > 0) {
      const data = pricePayload(symbol, last);
      if (data) return NextResponse.json({ ok: true, data });
    }
    console.warn(`[api/crypto/price] No price found for ${symbol}`);
    return NextResponse.json(
      { ok: false, error: `${symbol} price unavailable` },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: unknown) {
    console.error("[api/crypto/price] error:", err);
    return NextResponse.json(
      { ok: false, error: symbol ? `${symbol} price unavailable` : "price unavailable" },
      { headers: { "cache-control": "no-store" } }
    );
  }
}

/**
 * GET /api/crypto/price?symbol=BTC
 *
 * Freshest LIVE USD price: Swyftx → CoinGecko → Yahoo (via fetchCryptoQuotes),
 * with top-500 scan as a secondary lookup. Never swallows into a silent empty.
 */
import { NextResponse } from "next/server";
import { getTop500 } from "@/lib/crypto-source";
import { fetchCryptoQuotes } from "@/lib/market-data";
import { fetchSpotPrices } from "@/lib/crypto-swyftx";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    // 1) Direct multi-source quote (fast path for Buy dialog + fill integrity)
    try {
      const sx = await fetchSpotPrices([symbol]);
      if (sx[symbol]?.price > 0) {
        console.log(`[api/crypto/price] ${symbol} → ${sx[symbol].price} (Swyftx spot)`);
        return NextResponse.json({
          ok: true,
          data: {
            symbol,
            name: symbol,
            price: sx[symbol].price,
            change24h: sx[symbol].changePct,
            source: "swyftx",
          },
        });
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
            source: "quotes",
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
        console.log(`[api/crypto/price] ${symbol} → ${hit.price} (top500)`);
        return NextResponse.json({
          ok: true,
          data: {
            symbol: hit.symbol,
            name: hit.name,
            price: hit.price,
            change24h: hit.change24h,
            source: "markets",
          },
        });
      }
    } catch (err) {
      console.error("[api/crypto/price] top500 failed:", err);
    }

    console.warn(`[api/crypto/price] No live price found for ${symbol}`);
    return NextResponse.json(
      { ok: false, error: `No live price available for ${symbol}` },
      { status: 404 }
    );
  } catch (err: any) {
    console.error("[api/crypto/price] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load crypto price" },
      { status: 500 }
    );
  }
}

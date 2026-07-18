/**
 * GET /api/crypto/price?symbol=BTC
 *
 * Returns the freshest LIVE price for a single coin, priced off Swyftx (the
 * user's exchange) via the shared, server-cached top-500 scan — with automatic
 * CoinGecko fallback. Used by the Buy dialog so the "Live price" always reflects
 * the current market at the moment of purchase, regardless of which surface
 * launched the buy. Kept server-side so the Swyftx key never reaches the client.
 */
import { NextResponse } from "next/server";
import { getTop500 } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    const coins = await getTop500();
    const hit = coins.find((c) => c.symbol.toUpperCase() === symbol && c.price > 0);

    if (!hit) {
      console.warn(`[api/crypto/price] No live price found for ${symbol}`);
      return NextResponse.json(
        { ok: false, error: `No live price available for ${symbol}` },
        { status: 404 }
      );
    }

    console.log(`[api/crypto/price] ${symbol} → ${hit.price}`);
    return NextResponse.json({
      ok: true,
      data: { symbol: hit.symbol, name: hit.name, price: hit.price, change24h: hit.change24h },
    });
  } catch (err: any) {
    console.error("[api/crypto/price] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to fetch price" }, { status: 502 });
  }
}

/**
 * GET /api/crypto/spot?symbols=BTC,ETH
 *
 * One batched 24/7 crypto snapshot for the holdings page and price alerts.
 * Never applies NZX/ASX/US session gating. Repeated callers inside the TTL
 * share the same upstream fetch.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { fetchCryptoLiveSnapshot } from "@/lib/market-data";
import { normalizeCryptoSymbols } from "@/lib/crypto-live";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser({ refreshSession: false });
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const symbols = normalizeCryptoSymbols((url.searchParams.get("symbols") || "").split(","));
    if (!symbols.length) {
      return NextResponse.json({
        ok: true,
        data: { quotes: {}, updatedAt: new Date().toISOString(), live: true },
      });
    }

    const snap = await fetchCryptoLiveSnapshot(symbols);
    console.log(
      `[api/crypto/spot] ${symbols.length} symbols → ${Object.keys(snap.quotes).length} live @ ${snap.updatedAt}`
    );
    return NextResponse.json({ ok: true, data: snap });
  } catch (err: any) {
    console.error("[api/crypto/spot] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load crypto spot" },
      { status: 500 }
    );
  }
}

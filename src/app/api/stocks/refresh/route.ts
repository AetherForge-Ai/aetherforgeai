import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { simulateTick } from "@/lib/market";
import { fetchLiveQuotes, isLiveDataConfigured, fetchCryptoQuotes } from "@/lib/market-data";

/**
 * POST /api/stocks/refresh
 * Refreshes every holding's current price. When a live market-data key is
 * configured, real quotes are used; otherwise a bounded random-walk tick keeps
 * the demo tape moving. Persists and returns the updated holdings.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const stocks = (result?.data as any[]) || [];

    // Split by asset class: equities → Twelve Data, crypto → CoinGecko.
    const equityTickers = stocks.filter((s) => (s.asset_type || "stock") !== "crypto").map((s) => String(s.ticker));
    const cryptoTickers = stocks.filter((s) => (s.asset_type || "stock") === "crypto").map((s) => String(s.ticker));

    const [equityQuotes, cryptoQuotes] = await Promise.all([
      isLiveDataConfigured() && equityTickers.length ? fetchLiveQuotes(equityTickers) : Promise.resolve({}),
      cryptoTickers.length ? fetchCryptoQuotes(cryptoTickers) : Promise.resolve({}),
    ]);
    const live: Record<string, { price: number; changePct: number }> = { ...equityQuotes, ...cryptoQuotes };
    const usedLive = Object.keys(live).length > 0;

    const updates = await Promise.all(
      stocks.map(async (s) => {
        const base = Number(s.current_price) || Number(s.purchase_price) || 0;
        const quote = live[String(s.ticker).toUpperCase()];
        const next = quote?.price ?? simulateTick(base);
        try {
          await totalumSdk.crud.editRecordById("stock", s._id, { current_price: next });
        } catch (err) {
          console.error(`[api/stocks/refresh] Failed to update ${s._id}:`, err);
          throw err;
        }
        return { ...s, current_price: next };
      })
    );

    console.log(
      `[api/stocks/refresh] Updated ${updates.length} prices for user ${user._id} (source: ${usedLive ? "live" : "simulated"})`
    );
    return NextResponse.json({ ok: true, data: updates });
  } catch (err: any) {
    console.error("[api/stocks/refresh] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to refresh prices" }, { status: 500 });
  }
}

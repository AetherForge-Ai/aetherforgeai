import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { totalumSdk } from "@/lib/totalum";
import { simulateTick } from "@/lib/market";
import { fetchLiveQuotes, isLiveDataConfigured, fetchCryptoQuotes } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";
import {
  bullionMarkForHolding,
  isBullionHolding,
  quoteRouteForHolding,
  resolveHoldingMarkPrice,
} from "@/lib/metal-valuation";

/**
 * POST /api/stocks/refresh
 * Refreshes every holding's current price. When a live market-data key is
 * configured, real quotes are used; otherwise a bounded random-walk tick keeps
 * the demo tape moving. Persists and returns the updated holdings.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const stocks = (result?.data as any[]) || [];
    if (hasForeignOwner(stocks, user._id)) {
      console.error("[api/stocks/refresh] Refusing holdings owned by another user", {
        sessionUserId: user._id,
      });
      return accountMismatchResponse(user._id);
    }

    // Bullion spot is resolved on its own so an equity/crypto failure cannot
    // leave GOLD at the persisted Yahoo equity print.
    const hasBullion = stocks.some((s) => isBullionHolding(s.asset_type, s.ticker, s.company_name));
    let metalsSpot: Awaited<ReturnType<typeof getMetalsSpot>> | null = null;
    if (hasBullion) {
      try {
        metalsSpot = await getMetalsSpot();
      } catch (err) {
        console.error("[api/stocks/refresh] Bullion spot failed:", err);
      }
    }

    const equityTickers: string[] = [];
    const cryptoTickers: string[] = [];
    for (const s of stocks) {
      const route = quoteRouteForHolding(s.asset_type, s.ticker, s.company_name);
      if (route === "bullion") continue;
      if (route === "crypto") cryptoTickers.push(String(s.ticker));
      else equityTickers.push(String(s.ticker));
    }

    const [equityQuotes, cryptoQuotes] = await Promise.all([
      isLiveDataConfigured() && equityTickers.length
        ? fetchLiveQuotes(equityTickers).catch((err) => {
            console.error("[api/stocks/refresh] Equity quotes failed:", err);
            return {};
          })
        : Promise.resolve({}),
      cryptoTickers.length
        ? fetchCryptoQuotes(cryptoTickers).catch((err) => {
            console.error("[api/stocks/refresh] Crypto quotes failed:", err);
            return {};
          })
        : Promise.resolve({}),
    ]);
    const equityMap = equityQuotes as Record<string, { price: number }>;
    const cryptoMap = cryptoQuotes as Record<string, { price: number }>;
    const usedLive = Object.keys(equityMap).length > 0 || Object.keys(cryptoMap).length > 0 || !!metalsSpot;

    const updates = await Promise.all(
      stocks.map(async (s) => {
        const ticker = String(s.ticker || "");
        const key = ticker.toUpperCase();
        const route = quoteRouteForHolding(s.asset_type, ticker, s.company_name);
        const base = Number(s.current_price) || Number(s.purchase_price) || 0;
        const marked =
          route === "bullion"
            ? bullionMarkForHolding(s, metalsSpot)
            : resolveHoldingMarkPrice({
                ticker,
                assetType: s.asset_type,
                storedPrice: Number(s.current_price) || 0,
                purchasePrice: Number(s.purchase_price) || 0,
                equityQuote: route === "equity" ? equityMap[key]?.price : undefined,
                cryptoQuote: route === "crypto" ? cryptoMap[key]?.price : undefined,
              });
        // Bullion never random-walks and never takes an equity print.
        const next = marked != null && marked > 0 ? marked : route === "bullion" ? base : simulateTick(base);
        const row = { ...s, current_price: next };
        if (Math.abs((Number(s.current_price) || 0) - next) < 1e-6) return row;
        try {
          await totalumSdk.crud.editRecordById("stock", s._id, { current_price: next });
        } catch (err) {
          console.error(`[api/stocks/refresh] Failed to update ${s._id}:`, err);
          throw err;
        }
        return row;
      })
    );

    console.log(
      `[api/stocks/refresh] Updated ${updates.length} prices for user ${user._id} (source: ${usedLive ? "live" : "simulated"})`
    );
    return privateJson({ ok: true, userId: user._id, data: updates });
  } catch (err: any) {
    console.error("[api/stocks/refresh] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to refresh prices" }, { status: 500 });
  }
}

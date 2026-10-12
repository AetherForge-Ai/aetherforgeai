import { NextResponse } from "next/server";
import { getStableSessionUser } from "@/lib/session";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { totalumSdk } from "@/lib/totalum";
import { fetchLiveQuotes, isLiveDataConfigured, fetchCryptoLiveSnapshot } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";
import {
  bullionMarkForHolding,
  isBullionHolding,
  quoteRouteForHolding,
  resolveHoldingMarkPrice,
} from "@/lib/metal-valuation";
import { mergeFreshQuantities } from "@/lib/holding-snapshot";
import { overlayFifoPurchasePrices } from "@/lib/fifo-cost-server";

/**
 * POST /api/stocks/refresh
 * Refreshes every holding's current price from a live quote. An equity name
 * with no quote keeps its stored current_price and is not written. Bullion
 * and crypto keep the last real mark. Nothing here invents a price.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getStableSessionUser();
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
        ? fetchCryptoLiveSnapshot(cryptoTickers).catch((err) => {
            console.error("[api/stocks/refresh] Crypto quotes failed:", err);
            return { quotes: {}, updatedAt: new Date().toISOString(), live: true as const };
          })
        : Promise.resolve({ quotes: {}, updatedAt: new Date().toISOString(), live: true as const }),
    ]);
    const equityMap = equityQuotes as Record<string, { price: number }>;
    const cryptoMap = (cryptoQuotes.quotes ?? {}) as Record<string, { price: number }>;
    const usedLive = Object.keys(equityMap).length > 0 || Object.keys(cryptoMap).length > 0 || !!metalsSpot;

    const updates = await Promise.all(
      stocks.map(async (s) => {
        const ticker = String(s.ticker || "");
        const key = ticker.toUpperCase();
        const route = quoteRouteForHolding(s.asset_type, ticker, s.company_name);
        const base = Number(s.current_price) || Number(s.purchase_price) || 0;
        const equityQuote = route === "equity" ? equityMap[key]?.price : undefined;
        if (route === "equity" && !(typeof equityQuote === "number" && equityQuote > 0)) {
          return { ...s };
        }
        const marked =
          route === "bullion"
            ? bullionMarkForHolding(s, metalsSpot)
            : resolveHoldingMarkPrice({
                ticker,
                assetType: s.asset_type,
                storedPrice: Number(s.current_price) || 0,
                purchasePrice: Number(s.purchase_price) || 0,
                equityQuote,
                cryptoQuote: route === "crypto" ? cryptoMap[key]?.price : undefined,
              });
        // Bullion never takes an equity print. Crypto keeps the last real mark
        // when the live snapshot misses a coin. Equity without a quote is
        // returned above and is not written.
        const next = marked != null && marked > 0 ? marked : base;
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

    let data = updates;
    try {
      const fresh = await totalumSdk.crud.query("stock", {
        _filter: { user: user._id },
        _limit: 500,
      });
      data = mergeFreshQuantities(updates, (fresh?.data as { _id?: string; shares?: number; purchase_price?: number }[]) || []);
    } catch (err) {
      console.error("[api/stocks/refresh] Quantity re-read failed:", err);
    }
    data = await overlayFifoPurchasePrices(data, user._id);

    console.log(
      `[api/stocks/refresh] Updated ${updates.length} prices for user ${user._id} (source: ${usedLive ? "live" : "stored"})`
    );
    return privateJson({ ok: true, userId: user._id, data });
  } catch (err: any) {
    console.error("[api/stocks/refresh] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to refresh prices" }, { status: 500 });
  }
}

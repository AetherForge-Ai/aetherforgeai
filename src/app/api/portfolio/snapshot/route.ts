import { NextResponse } from "next/server";

import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { bookCacheEpoch, readBookCache, writeBookCache } from "@/lib/book-cache";
import { currencyForTicker } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import { isBullionHolding, isContaminatedEquityPrint } from "@/lib/metal-valuation";
import { getMetalsSpot } from "@/lib/metals";
import {
  buildPortfolioSnapshot,
  type SnapshotExtraPosition,
  type SnapshotLedgerRow,
  type SnapshotMark,
} from "@/lib/portfolio-snapshot";
import { getStableSessionUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { loadLedger } from "@/lib/transactions";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/snapshot
 * One NZD book for every dashboard total. Prices and rates that were not
 * returned stay blank. No new database columns.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }

    const cacheKey = `${user._id}:portfolio-snapshot`;
    const epoch = bookCacheEpoch(user._id);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const cached = fresh ? null : readBookCache<ReturnType<typeof buildPortfolioSnapshot>>(cacheKey);
    if (cached) return privateJson({ ok: true, userId: user._id, data: cached });

    const [ledger, stockRes, metalRes, fx, spot] = await Promise.all([
      loadLedger(user),
      totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 500 }),
      totalumSdk.crud.query("precious_metal", { _filter: { user: user._id }, _limit: 200 }),
      getFxSnapshot(),
      getMetalsSpot().catch(() => null),
    ]);

    const stocks = (stockRes?.data as Array<Record<string, unknown>>) || [];
    const metals = (metalRes?.data as Array<Record<string, unknown>>) || [];
    if (hasForeignOwner(ledger.transactions, user._id) || hasForeignOwner(stocks, user._id) || hasForeignOwner(metals, user._id)) {
      return accountMismatchResponse(user._id);
    }

    const marks: SnapshotMark[] = stocks.map((row) => {
      const ticker = String(row.ticker || "");
      const assetType = String(row.asset_type || "stock");
      const name = row.company_name ? String(row.company_name) : null;
      const stored = Number(row.current_price);
      const purchase = Number(row.purchase_price) || 0;
      const bullion = isBullionHolding(assetType, ticker, name);
      const spotPx =
        bullion && spot?.live
          ? Number(assetType === "metal" || ticker.toUpperCase() === "SILVER" || ticker.toUpperCase() === "XAG" ? spot.silver.nzdPerOz : spot.gold.nzdPerOz)
          : 0;
      const silver = bullion && /silver|xag/i.test(`${ticker} ${name || ""}`);
      const liveOz = bullion && spot?.live ? (silver ? spot.silver.nzdPerOz : spot.gold.nzdPerOz) : 0;
      const usableSpot = liveOz > 0 ? liveOz : spotPx > 0 ? spotPx : 0;
      let price: number | null = null;
      let reason: string | null = null;
      let source = "Stored holding price";
      if (bullion && usableSpot > 0) {
        price = usableSpot;
        source = "Gold spot feed";
      } else if (stored > 0 && !(bullion && isContaminatedEquityPrint(stored, purchase))) {
        price = stored;
      } else if (bullion) {
        reason = "Spot feed did not return a price for this metal.";
        source = "Gold spot feed";
      } else {
        reason = "No price is stored for this holding.";
      }
      return {
        ticker,
        price,
        reason,
        source,
        asOf: row.updatedAt ? String(row.updatedAt) : spot?.quotedAt || null,
        name,
        assetType,
        currency: bullion ? "NZD" : currencyForTicker(ticker, assetType === "crypto" ? "crypto" : "stock"),
      };
    });

    const extras: SnapshotExtraPosition[] = metals.map((row) => {
      const metal = String(row.metal || "gold");
      const ticker = metal === "silver" ? "SILVER" : "GOLD";
      const ounces = Number(row.ounces) || 0;
      const cost = Number(row.purchase_price_per_oz) || 0;
      const live = Boolean(spot?.live);
      const mark = live ? (metal === "silver" ? spot?.silver.nzdPerOz : spot?.gold.nzdPerOz) : null;
      return {
        id: String(row._id || ticker),
        ticker,
        name: metal === "silver" ? "Silver bullion" : "Gold bullion",
        assetClass: "metals",
        quantity: ounces,
        costPrice: cost,
        currency: "NZD",
        fxAtCost: 1,
        markPrice: mark != null && mark > 0 ? mark : null,
        markReason: mark != null && mark > 0 ? null : "Spot feed did not return a price for this metal.",
        source: "Gold spot feed",
        asOf: spot?.quotedAt || null,
      };
    });

    const snapshot = buildPortfolioSnapshot({
      rows: ledger.transactions as SnapshotLedgerRow[],
      marks,
      extras,
      fxNow: fx.ratesToNZD,
      fxSourced: fx.sourced,
      fxSource: fx.sourced ? "Exchange-rate feed" : null,
      fxAsOf: fx.asOf,
      asOf: new Date().toISOString(),
      priceSource: "Ledger and stored prices",
    });

    writeBookCache(cacheKey, snapshot, epoch);
    return privateJson({ ok: true, userId: user._id, data: snapshot });
  } catch (err) {
    console.error("[api/portfolio/snapshot] GET error:", err);
    const message = err instanceof Error ? err.message : "Failed to build the portfolio snapshot";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

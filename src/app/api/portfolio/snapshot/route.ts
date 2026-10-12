import { NextResponse } from "next/server";

import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { currencyForTicker } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import { fetchCryptoQuotes, fetchLiveQuotes, isLiveDataConfigured } from "@/lib/market-data";
import { isContaminatedEquityPrint, quoteRouteForHolding } from "@/lib/metal-valuation";
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

    const claimed = req.headers.get("x-af-user-id");
    if (claimed && claimed !== user._id) return accountMismatchResponse(user._id);

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

    const equityTickers: string[] = [];
    const cryptoTickers: string[] = [];
    for (const row of stocks) {
      const route = quoteRouteForHolding(String(row.asset_type || "stock"), String(row.ticker || ""), row.company_name ? String(row.company_name) : null);
      if (route === "crypto") cryptoTickers.push(String(row.ticker || ""));
      else if (route === "equity") equityTickers.push(String(row.ticker || ""));
    }
    const [equityQuotes, cryptoQuotes] = await Promise.all([
      isLiveDataConfigured() && equityTickers.length ? fetchLiveQuotes(equityTickers) : Promise.resolve({}),
      cryptoTickers.length ? fetchCryptoQuotes(cryptoTickers) : Promise.resolve({}),
    ]);

    const marks: SnapshotMark[] = stocks.map((row) => {
      const ticker = String(row.ticker || "");
      const assetType = String(row.asset_type || "stock");
      const name = row.company_name ? String(row.company_name) : null;
      const stored = Number(row.current_price);
      const purchase = Number(row.purchase_price) || 0;
      const route = quoteRouteForHolding(assetType, ticker, name);
      const key = ticker.toUpperCase();
      const silver = /silver|xag/i.test(`${ticker} ${name || ""}`);
      const spotSource = silver ? "Silver spot feed" : "Gold spot feed";
      let price: number | null = null;
      let reason: string | null = null;
      let source = "Stored holding price";
      let asOf = row.updatedAt ? String(row.updatedAt) : null;
      if (route === "bullion") {
        const liveOz = spot?.live ? (silver ? spot.silver.nzdPerOz : spot.gold.nzdPerOz) : 0;
        source = spotSource;
        asOf = spot?.quotedAt || asOf;
        if (liveOz > 0) price = liveOz;
        else {
          reason = "Spot feed did not return a price for this metal.";
        }
      } else if (route === "crypto") {
        const live = Number(cryptoQuotes[key]?.price);
        if (live > 0) {
          price = live;
          source = "Crypto quote";
          asOf = cryptoQuotes[key]?.quotedAt || asOf;
        } else if (stored > 0) {
          price = stored;
        } else {
          reason = "No live crypto quote or stored price is available for this holding.";
        }
      } else {
        const live = Number(equityQuotes[key]?.price);
        if (live > 0) {
          price = live;
          source = "Equity quote";
          asOf = equityQuotes[key]?.quotedAt || asOf;
        } else if (stored > 0 && !isContaminatedEquityPrint(stored, purchase)) {
          price = stored;
        } else {
          reason = "No live quote or stored price is available for this holding.";
        }
      }
      return {
        ticker,
        price,
        reason,
        source,
        asOf,
        name,
        assetType,
        currency: route === "bullion" ? "NZD" : currencyForTicker(ticker, route === "crypto" ? "crypto" : "stock"),
      };
    });

    const extras: SnapshotExtraPosition[] = metals.map((row) => {
      const metal = String(row.metal || "gold");
      const silver = metal === "silver";
      const ticker = silver ? "SILVER" : "GOLD";
      const ounces = Number(row.ounces) || 0;
      const cost = Number(row.purchase_price_per_oz) || 0;
      const live = Boolean(spot?.live);
      const mark = live ? (silver ? spot?.silver.nzdPerOz : spot?.gold.nzdPerOz) : null;
      return {
        id: String(row._id || ticker),
        ticker,
        name: silver ? "Silver bullion" : "Gold bullion",
        assetClass: "metals",
        quantity: ounces,
        costPrice: cost,
        currency: "NZD",
        fxAtCost: 1,
        markPrice: mark != null && mark > 0 ? mark : null,
        markReason: mark != null && mark > 0 ? null : "Spot feed did not return a price for this metal.",
        source: silver ? "Silver spot feed" : "Gold spot feed",
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
      priceSource: "Live quotes and the holdings overlay",
    });

    return privateJson({ ok: true, userId: user._id, data: snapshot });
  } catch (err) {
    console.error("[api/portfolio/snapshot] GET error:", err);
    const message = err instanceof Error ? err.message : "Failed to build the portfolio snapshot";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

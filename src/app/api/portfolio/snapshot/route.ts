import { NextResponse } from "next/server";

import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { bookCacheEpoch, readBookCache, writeBookCache } from "@/lib/book-cache";
import { currencyForTicker } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import { fetchCryptoQuotes, fetchLiveQuotes, isLiveDataConfigured, type LiveQuote } from "@/lib/market-data";
import { isContaminatedEquityPrint, quoteRouteForHolding } from "@/lib/metal-valuation";
import { getMetalsSpot } from "@/lib/metals";
import {
  buildPortfolioSnapshot,
  type PortfolioSnapshot,
  type SnapshotExtraPosition,
  type SnapshotLedgerRow,
  type SnapshotMark,
} from "@/lib/portfolio-snapshot";
import { getStableSessionUser } from "@/lib/session";
import {
  priceFromQuoteOrStored,
  raceQuoteFetch,
  SNAPSHOT_QUOTE_WAIT_MS,
  STORED_HOLDING_PRICE,
} from "@/lib/snapshot-quotes";
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

    // Trades bump bookCacheEpoch and drop this key, so the next read is fresh.
    // ?fresh=1 skips the read (explicit refresh and the post-trade reload).
    const cacheKey = `${user._id}:portfolio-snapshot`;
    const cacheEpoch = bookCacheEpoch(user._id);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    if (!fresh) {
      const cached = readBookCache<PortfolioSnapshot>(cacheKey);
      if (cached) return privateJson({ ok: true, userId: user._id, data: cached });
    }

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
    const emptyQuotes: Record<string, LiveQuote> = {};
    const [equityRace, cryptoRace] = await Promise.all([
      isLiveDataConfigured() && equityTickers.length
        ? raceQuoteFetch(fetchLiveQuotes(equityTickers), emptyQuotes, SNAPSHOT_QUOTE_WAIT_MS)
        : Promise.resolve({ value: emptyQuotes, timedOut: false }),
      cryptoTickers.length
        ? raceQuoteFetch(fetchCryptoQuotes(cryptoTickers), emptyQuotes, SNAPSHOT_QUOTE_WAIT_MS)
        : Promise.resolve({ value: emptyQuotes, timedOut: false }),
    ]);
    if (equityRace.timedOut || cryptoRace.timedOut) {
      console.warn(
        "[api/portfolio/snapshot] A quote feed exceeded 1.2s — stored prices are used for the marks that did not arrive."
      );
    }
    const equityQuotes = equityRace.value;
    const cryptoQuotes = cryptoRace.value;

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
      let source = STORED_HOLDING_PRICE;
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
        const chosen = priceFromQuoteOrStored({
          livePrice: cryptoQuotes[key]?.price,
          stored,
          liveSource: "Crypto quote",
          missingReason: "No live crypto quote or stored price is available for this holding.",
        });
        price = chosen.price;
        reason = chosen.reason;
        source = chosen.source;
        if (chosen.usedLive) asOf = cryptoQuotes[key]?.quotedAt || asOf;
      } else {
        const chosen = priceFromQuoteOrStored({
          livePrice: equityQuotes[key]?.price,
          stored,
          purchase,
          contaminated: isContaminatedEquityPrint,
          liveSource: "Equity quote",
          missingReason: "No live quote or stored price is available for this holding.",
        });
        price = chosen.price;
        reason = chosen.reason;
        source = chosen.source;
        if (chosen.usedLive) asOf = equityQuotes[key]?.quotedAt || asOf;
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

    if (!writeBookCache(cacheKey, snapshot, cacheEpoch)) {
      console.log("[api/portfolio/snapshot] Dropped cache write — a trade landed while this read was in flight");
    }

    return privateJson({ ok: true, userId: user._id, data: snapshot });
  } catch (err) {
    console.error("[api/portfolio/snapshot] GET error:", err);
    const message = err instanceof Error ? err.message : "Failed to build the portfolio snapshot";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
